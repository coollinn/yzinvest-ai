#!/bin/bash
# 最后更新：2026.05.01
# ============================================================================
# YZInvest AI — 增量同步脚本
# 功能：智能检测差异，仅同步变化部分
#
# 策略：
#   Layer 1（stocks）    → 全量拉取，ON CONFLICT 自动覆盖变化记录
#   Layer 2（stock_daily）→ 按交易日增量，仅补漏未同步的日期
#
# 用法：
#   ./sync_incremental.sh                    # 今日增量（默认）
#   ./sync_incremental.sh --date 20260501    # 指定日期行情
#   ./sync_incremental.sh --stocks-only       # 仅 Layer 1
#   ./sync_incremental.sh --dry-run           # 预览模式（不写入数据库）
# ============================================================================
set -e

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API_DIR="$PROJECT_ROOT/apps/api"
DB_NAME="yzinvest"
FETCH_SCRIPT="$PROJECT_ROOT/scripts/fetch_all_stocks.py"

# --------------------------------------------------------------------------
# 参数解析
# --------------------------------------------------------------------------
MODE="daily"        # daily | full | stocks-only
DRY_RUN="false"
TARGET_DATE=""
PROXY_REQUIRED="true"

for arg in "$@"; do
  case "$arg" in
    --full)          MODE="full" ;;
    --stocks-only)   MODE="stocks-only" ;;
    --dry-run)       DRY_RUN="true" ;;
    --local-only)    PROXY_REQUIRED="false" ;;
  esac
done

# 处理 --date YYYYMMDD
if [[ "$1" == "--date" ]] && [[ "$2" =~ ^[0-9]{8}$ ]]; then
  TARGET_DATE="$2"
fi
if [[ "$1" =~ ^--date=(.+) ]]; then
  TARGET_DATE="${1#*=}"
fi

# --------------------------------------------------------------------------
# 颜色 & 日志
# --------------------------------------------------------------------------
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; NC='\033[0m'

log()   { echo -e "${GREEN}[$(date '+%H:%M:%S')]${NC} $1"; }
info()  { echo -e "${BLUE}[INFO]${NC}   $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; }
step()  { echo -e "${CYAN}━━━ $1 ━━━${NC}"; }
ok()    { echo -e "  ✅ $1"; }
fail()  { echo -e "  ❌ $1"; }

# --------------------------------------------------------------------------
# 工具函数
# --------------------------------------------------------------------------
check_proxy() {
  curl -s --max-time 4 --noproxy "*" \
    "https://api.cloudflare.com/" -o /dev/null 2>&1
}

stop_wrangler() {
  if lsof -i :8787 -t > /dev/null 2>&1; then
    warn "停止 wrangler dev（避免文件锁）..."
    pkill -f "wrangler dev" 2>/dev/null || true
    for pid in $(lsof -ti :8787 2>/dev/null || true); do
      kill -9 "$pid" 2>/dev/null || true
    done
    sleep 2
  fi
}

# --------------------------------------------------------------------------
# sync_meta 表管理
# --------------------------------------------------------------------------
init_meta() {
  local d1_flag="$1"
  cd "$API_DIR"
  npx wrangler d1 execute $DB_NAME $d1_flag \
    --command "CREATE TABLE IF NOT EXISTS sync_meta (
      layer TEXT PRIMARY KEY,
      last_sync TEXT,
      last_count INTEGER DEFAULT 0,
      last_date TEXT DEFAULT ''
    );" 2>/dev/null | tail -1
}

get_meta() {
  local layer="$1"
  local d1_flag="$2"
  cd "$API_DIR"
  npx wrangler d1 execute $DB_NAME $d1_flag \
    --command "SELECT last_sync,last_count,last_date FROM sync_meta WHERE layer='$layer';" \
    2>/dev/null | grep -oE '[0-9]{4}-[0-9]{2}-[0-9]{2}|[0-9]+' | head -3
}

set_meta() {
  local layer="$1"; local count="$2"; local last_date="$3"; local d1_flag="$4"
  cd "$API_DIR"
  npx wrangler d1 execute $DB_NAME $d1_flag \
    --command "INSERT INTO sync_meta (layer,last_sync,last_count,last_date)
    VALUES ('$layer',datetime('now'),$count,'$last_date')
    ON CONFLICT(layer) DO UPDATE SET
    last_sync=datetime('now'),last_count=$count,last_date='$last_date';" \
    2>/dev/null | tail -1
}

# --------------------------------------------------------------------------
# 获取已同步交易日列表
# --------------------------------------------------------------------------
get_synced_dates() {
  local d1_flag="$1"
  cd "$API_DIR"
  npx wrangler d1 execute $DB_NAME $d1_flag \
    --command "SELECT DISTINCT trade_date FROM stock_daily ORDER BY trade_date DESC LIMIT 30;" \
    2>/dev/null | grep -oE '[0-9]{8}' | sort -r
}

# --------------------------------------------------------------------------
# SQL 分批（Python，提取为函数复用）
# --------------------------------------------------------------------------
split_sql() {
  local sql_file="$1"; local batch_dir="$2"
  python3 - << PYEOF
import re, os
with open("$sql_file") as f: c = f.read()
c = re.sub(r'--[^\n]*\n', '\n', c)
c = re.sub(r'BEGIN TRANSACTION;?\n?', '', c, flags=re.I)
c = re.sub(r'\n?COMMIT;?', '', c, flags=re.I)
sqls = [s.strip() for s in c.split(';') if s.strip() and len(s.strip()) > 20]
os.makedirs("$batch_dir", exist_ok=True)
for i in range(0, len(sqls), 100):
    with open(f"$batch_dir/b{i//100+1:03d}.sql",'w') as f:
        f.write(";\n".join(sqls[i:i+100])+";\n")
print(len(sqls))
PYEOF
}

# --------------------------------------------------------------------------
# 批量导入 D1
# --------------------------------------------------------------------------
import_d1() {
  local d1_flag="$1"; local batch_dir="$2"; local label="$3"
  cd "$API_DIR"
  local s=0 f=0
  local total
  total=$(find "$batch_dir" -name "b*.sql" 2>/dev/null | wc -l | tr -d ' ')
  for batch in "$batch_dir"/b*.sql; do
    local out
    out=$(npx wrangler d1 execute $DB_NAME $d1_flag --file="$batch" 2>&1)
    echo "$out" | grep -qE '"success": true|Success' && s=$((s+1)) || f=$((f+1))
    [ "$d1_flag" = "--remote" ] && sleep 0.3
  done
  ok "$label: $s 成功, $f 失败"
  echo "$s:$f"
}

# --------------------------------------------------------------------------
# Step 1: 差异分析
# --------------------------------------------------------------------------
analyze() {
  step "差异分析"

  stop_wrangler
  init_meta "--local"

  local local_stocks
  local_stocks=$(cd "$API_DIR" && npx wrangler d1 execute $DB_NAME --local \
    --command "SELECT COUNT(*) FROM stocks;" 2>/dev/null | \
    grep -oE '[0-9]+' | tail -1 || echo "0")
  ok "本地 stocks: $local_stocks 条"

  local synced_dates date_count
  synced_dates=$(get_synced_dates "--local")
  date_count=$(echo "$synced_dates" | grep -c . || echo "0")
  ok "已同步交易日: $date_count 天"

  if [ "$date_count" -gt 0 ]; then
    echo "  最新: $(echo "$synced_dates" | head -1) | 最早: $(echo "$synced_dates" | tail -1)"
  fi

  # sync_meta 信息
  local meta
  meta=$(get_meta "layer1" "--local")
  if [ -n "$meta" ]; then
    ok "Layer 1 上次同步: $meta"
  fi

  echo ""
  case "$MODE" in
    stocks-only) info "模式: 仅 Layer 1（股票基础信息）" ;;
    full)        info "模式: 全量（含所有交易日）" ;;
    *)           info "模式: 每日增量（仅同步今天行情）" ;;
  esac
  [ "$DRY_RUN" = "true" ] && warn "预览模式：不会写入数据库"
}

# --------------------------------------------------------------------------
# Step 2: Layer 1 — 股票基础信息
# --------------------------------------------------------------------------
sync_layer1() {
  step "Layer 1 — 同步股票基础信息"
  log "拉取全量股票列表（--stocks-only，无行情）..."

  local SQL_FILE="/tmp/layer1_$(date +%Y%m%d_%H%M%S).sql"
  cd "$PROJECT_ROOT"
  python3 "$FETCH_SCRIPT" "$SQL_FILE" --stocks-only --json 2>&1 | tail -4

  if [ ! -s "$SQL_FILE" ]; then
    error "SQL 生成失败！" && return 1
  fi

  local cnt
  cnt=$(grep -c "INSERT INTO stocks " "$SQL_FILE" 2>/dev/null || echo "0")
  ok "生成 stocks SQL: $cnt 条"

  if [ "$DRY_RUN" = "true" ]; then
    info "[dry-run] 跳过写入"
    rm -f "$SQL_FILE"
    return 0
  fi

  local batch_dir="/tmp/l1_$$"
  split_sql "$SQL_FILE" "$batch_dir"
  rm -f "$SQL_FILE"
  stop_wrangler
  import_d1 "--local" "$batch_dir" "Layer 1 导入"
  rm -rf "$batch_dir"

  local new_cnt
  new_cnt=$(cd "$API_DIR" && npx wrangler d1 execute $DB_NAME --local \
    --command "SELECT COUNT(*) FROM stocks;" 2>/dev/null | \
    grep -oE '[0-9]+' | tail -1 || echo "$cnt")
  set_meta "layer1" "$new_cnt" "$(date +%Y%m%d)" "--local"
  ok "本地 stocks: $new_cnt 条"
}

# --------------------------------------------------------------------------
# Step 3: Layer 2 — 行情数据
# --------------------------------------------------------------------------
sync_layer2() {
  step "Layer 2 — 同步行情数据"

  # 确定目标日期
  local target="${TARGET_DATE:-$(date +%Y%m%d)}"

  local existing
  existing=$(cd "$API_DIR" && npx wrangler d1 execute $DB_NAME --local \
    --command "SELECT COUNT(*) FROM stock_daily WHERE trade_date='$target';" \
    2>/dev/null | grep -oE '[0-9]+' | tail -1 || echo "0")

  if [ "$existing" -gt 0 ]; then
    ok "日期 $target 已有 $existing 条行情，跳过"
    return 0
  fi

  log "拉取 $target 行情数据..."
  local SQL_FILE="/tmp/layer2_${target}.sql"
  cd "$PROJECT_ROOT"
  python3 "$FETCH_SCRIPT" "$SQL_FILE" --date "$target" --json 2>&1 | tail -4

  if [ ! -s "$SQL_FILE" ]; then
    error "行情 SQL 生成失败！" && return 1
  fi

  local cnt
  cnt=$(grep -c "INSERT INTO stock_daily " "$SQL_FILE" 2>/dev/null || echo "0")
  ok "生成 stock_daily SQL: $cnt 条"

  if [ "$DRY_RUN" = "true" ]; then
    info "[dry-run] 跳过写入"
    rm -f "$SQL_FILE"
    return 0
  fi

  local batch_dir="/tmp/l2_$$"
  split_sql "$SQL_FILE" "$batch_dir"
  rm -f "$SQL_FILE"
  stop_wrangler
  import_d1 "--local" "$batch_dir" "Layer 2 导入"
  rm -rf "$batch_dir"

  set_meta "layer2" "$cnt" "$target" "--local"
}

# --------------------------------------------------------------------------
# Step 4: 远程同步
# --------------------------------------------------------------------------
sync_remote() {
  if ! check_proxy; then
    warn "代理未开启，跳过远程同步"
    return 1
  fi

  step "同步远程 D1"
  init_meta "--remote"

  # Layer 1
  log "远程 Layer 1..."
  local SQL_FILE="/tmp/r_layer1_$(date +%Y%m%d_%H%M%S).sql"
  cd "$PROJECT_ROOT"
  python3 "$FETCH_SCRIPT" "$SQL_FILE" --stocks-only --json 2>&1 | tail -2

  if [ -s "$SQL_FILE" ]; then
    local batch_dir="/tmp/r1_$$"
    split_sql "$SQL_FILE" "$batch_dir"
    rm -f "$SQL_FILE"
    import_d1 "--remote" "$batch_dir" "远程 stocks"
    rm -rf "$batch_dir"
  fi

  # Layer 2
  local target="${TARGET_DATE:-$(date +%Y%m%d)}"
  log "远程 Layer 2 ($target)..."
  local SQL_FILE="/tmp/r_layer2_${target}.sql"
  cd "$PROJECT_ROOT"
  python3 "$FETCH_SCRIPT" "$SQL_FILE" --date "$target" --json 2>&1 | tail -2

  if [ -s "$SQL_FILE" ]; then
    local batch_dir="/tmp/r2_$$"
    split_sql "$SQL_FILE" "$batch_dir"
    rm -f "$SQL_FILE"
    import_d1 "--remote" "$batch_dir" "远程 stock_daily"
    rm -rf "$batch_dir"
  fi
}

# --------------------------------------------------------------------------
# Step 5: 校验
# --------------------------------------------------------------------------
verify() {
  step "数据校验"
  cd "$API_DIR"

  printf "  %-20s" "本地 stocks:"
  echo $(npx wrangler d1 execute $DB_NAME --local \
    --command "SELECT COUNT(*) FROM stocks;" 2>/dev/null | \
    grep -oE '[0-9]+' | tail -1 || echo "?") 条

  printf "  %-20s" "本地 stock_daily:"
  echo $(npx wrangler d1 execute $DB_NAME --local \
    --command "SELECT COUNT(*) FROM stock_daily;" 2>/dev/null | \
    grep -oE '[0-9]+' | tail -1 || echo "?") 条

  printf "  %-20s" "最新交易日:"
  echo $(npx wrangler d1 execute $DB_NAME --local \
    --command "SELECT MAX(trade_date) FROM stock_daily;" 2>/dev/null | \
    grep -oE '[0-9]{8}' | tail -1 || echo "?")

  if check_proxy; then
    printf "  %-20s" "远程 stocks:"
    echo $(npx wrangler d1 execute $DB_NAME --remote \
      --command "SELECT COUNT(*) FROM stocks;" 2>/dev/null | \
      grep -oE '[0-9]+' | tail -1 || echo "?") 条
    printf "  %-20s" "远程 stock_daily:"
    echo $(npx wrangler d1 execute $DB_NAME --remote \
      --command "SELECT COUNT(*) FROM stock_daily;" 2>/dev/null | \
      grep -oE '[0-9]+' | tail -1 || echo "?") 条
  fi
}

# --------------------------------------------------------------------------
# 主流程
# --------------------------------------------------------------------------
main() {
  echo ""
  echo "╔══════════════════════════════════════════════════════╗"
  echo "║   YZInvest AI — 增量同步  $(date '+%Y-%m-%d %H:%M')             ║"
  echo "╚══════════════════════════════════════════════════════╝"
  echo ""

  [ "$DRY_RUN" = "true" ] && warn "⚠️  预览模式（不会写入数据库）"

  analyze

  echo ""
  read -p "继续？ [yes] / no: " confirm
  [ "$confirm" = "no" ] && info "取消" && exit 0

  sync_layer1

  if [ "$MODE" != "stocks-only" ]; then
    sync_layer2
  fi

  if [ "$PROXY_REQUIRED" = "true" ] && check_proxy; then
    sync_remote
  fi

  verify
  echo ""
  log "增量同步完成！🎉"
  info "每日运行：./sync_incremental.sh"
  info "全量重刷：./sync_all.sh"
}

main "$@"
