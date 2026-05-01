#!/bin/bash
# 最后更新：2026.05.01
# ============================================================================
# YZInvest AI — 断点续传脚本
# 功能：检测已有数据量，智能判断从哪页继续，只补漏不重复
# 适用场景：上次 sync_all.sh 中断（网络抖动、代理断开等）
# 用法：./sync_resume.sh [--local-only] [--remote-only]
# ============================================================================
set -e

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API_DIR="$PROJECT_ROOT/apps/api"
DB_NAME="yzinvest"

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

# --------------------------------------------------------------------------
# 参数
# --------------------------------------------------------------------------
MODE="both"
for arg in "$@"; do
  case "$arg" in
    --local-only)  MODE="local-only" ;;
    --skip-local)  MODE="remote-only" ;;
  esac
done

# --------------------------------------------------------------------------
# 工具函数
# --------------------------------------------------------------------------
check_proxy() {
  curl -s --max-time 4 --noproxy "*" \
    "https://api.cloudflare.com/" -o /dev/null 2>&1
}

stop_wrangler() {
  info "检查 wrangler dev 进程..."
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
# Step 1: 检测现有数据量
# --------------------------------------------------------------------------
detect_current() {
  step "检测现有数据量"

  # 检查本地
  stop_wrangler
  local local_stocks local_daily
  local_stocks=$(cd "$API_DIR" && \
    npx wrangler d1 execute $DB_NAME --local \
    --command "SELECT COUNT(*) FROM stocks;" 2>/dev/null | \
    grep -oE '[0-9]+' | tail -1 || echo "0")
  local_daily=$(cd "$API_DIR" && \
    npx wrangler d1 execute $DB_NAME --local \
    --command "SELECT COUNT(*) FROM stock_daily;" 2>/dev/null | \
    grep -oE '[0-9]+' | tail -1 || echo "0")

  echo "  本地 stocks: $local_stocks 条"
  echo "  本地 stock_daily: $local_daily 条"

  # 检查远程
  local remote_stocks="未知" remote_daily="未知"
  if check_proxy; then
    remote_stocks=$(cd "$API_DIR" && \
      npx wrangler d1 execute $DB_NAME --remote \
      --command "SELECT COUNT(*) FROM stocks;" 2>/dev/null | \
      grep -oE '[0-9]+' | tail -1 || echo "0")
    remote_daily=$(cd "$API_DIR" && \
      npx wrangler d1 execute $DB_NAME --remote \
      --command "SELECT COUNT(*) FROM stock_daily;" 2>/dev/null | \
      grep -oE '[0-9]+' | tail -1 || echo "0")
    echo "  远程 stocks: $remote_stocks 条"
    echo "  远程 stock_daily: $remote_daily 条"
  else
    warn "代理未开启，跳过远程检测"
  fi

  # 判断
  local TARGET_STOCKS=12386
  local GAP=$((TARGET_STOCKS - local_stocks))

  if [ "$GAP" -le 0 ]; then
    echo ""
    log "✅ stocks 数据已满（$local_stocks/$TARGET_STOCKS），无需续传"
    return 1
  else
    echo ""
    info "缺失: $GAP 条 stocks 记录"
    info "方案：由于 fetch_all_stocks.py 使用 ON CONFLICT 覆盖，直接运行 sync_all.sh 即可"
    info "     （不怕重复拉取，ON CONFLICT 会更新已有记录）"
    echo ""
    return 0
  fi
}

# --------------------------------------------------------------------------
# Step 2: 执行增量同步（只用本地已有的数据做基准）
# --------------------------------------------------------------------------
incremental_sync() {
  step "执行增量同步"

  local SQL_FILE="/tmp/stocks_resume_$(date +%Y%m%d_%H%M%S).sql"
  log "重新拉取数据 -> $SQL_FILE"

  cd "$PROJECT_ROOT"
  python3 "$PROJECT_ROOT/scripts/fetch_all_stocks.py" "$SQL_FILE" 2>&1

  if [ ! -s "$SQL_FILE" ]; then
    error "SQL 文件生成失败！"
    exit 1
  fi

  local stock_cnt daily_cnt
  stock_cnt=$(grep -c "INSERT INTO stocks " "$SQL_FILE" 2>/dev/null || echo "0")
  daily_cnt=$(grep -c "INSERT INTO stock_daily " "$SQL_FILE" 2>/dev/null || echo "0")
  info "获取完成: stocks=$stock_cnt, daily=$daily_cnt"

  # 清理 & 分批
  log "分批处理..."
  python3 - << 'PYEOF'
import re, os, sys

sql_file = sys.argv[1] if len(sys.argv) > 1 else "/tmp/stocks_resume.sql"
batch_dir = "/tmp/d1_resume_$$"
os.makedirs(batch_dir, exist_ok=True)

with open(sql_file, encoding="utf-8") as f:
    content = f.read()

content = re.sub(r'--[^\n]*\n', '\n', content)
content = re.sub(r'BEGIN TRANSACTION;?\n?', '', content, flags=re.IGNORECASE)
content = re.sub(r'\n?COMMIT;?', '', content, flags=re.IGNORECASE)

raw_sqls = [s.strip() for s in content.split(';') if s.strip() and len(s.strip()) > 20]

BATCH = 100
for i in range(0, len(raw_sqls), BATCH):
    batch = raw_sqls[i:i+BATCH]
    n = i // BATCH + 1
    with open(f"{batch_dir}/batch_{n:03d}.sql", "w", encoding="utf-8") as f:
        f.write(";\n".join(batch) + ";\n")

print(f"OK:{len(raw_sqls)}:{(len(raw_sqls)-1)//BATCH+1}")
PYEOF
  "$SQL_FILE"

  # 导入本地（不清空，只追加/覆盖，因为用了 ON CONFLICT）
  if [ "$MODE" != "remote-only" ]; then
    step "导入本地 D1（增量模式，不清空）"
    cd "$API_DIR"
    local batch_dir="/tmp/d1_resume_$$"
    local success=0 fail=0
    local total_batches
    total_batches=$(find "$batch_dir" -name "batch_*.sql" 2>/dev/null | wc -l | tr -d ' ')
    log "共 $total_batches 批..."

    for f in "$batch_dir"/batch_*.sql; do
      local name out
      name=$(basename "$f")
      out=$(npx wrangler d1 execute $DB_NAME --local --file="$f" 2>&1)
      if echo "$out" | grep -qE '"success": true|Success|✅'; then
        success=$((success+1))
        echo -ne "\r  $name ... ✅ $success/$total_batches    "
      else
        fail=$((fail+1))
        echo -ne "\r  $name ... ❌ ($fail)  "
      fi
    done
    echo ""
    log "本地导入: $success 成功, $fail 失败"
  fi

  # 导入远程
  if [ "$MODE" = "both" ] && check_proxy; then
    step "导入远程 D1（增量模式，不清空）"
    cd "$API_DIR"
    local batch_dir="/tmp/d1_resume_$$"
    local success=0 fail=0
    local total_batches
    total_batches=$(find "$batch_dir" -name "batch_*.sql" 2>/dev/null | wc -l | tr -d ' ')
    log "共 $total_batches 批（远程）..."

    for f in "$batch_dir"/batch_*.sql; do
      local name out
      name=$(basename "$f")
      out=$(npx wrangler d1 execute $DB_NAME --remote --file="$f" 2>&1)
      if echo "$out" | grep -qE '"success": true|Success|✅'; then
        success=$((success+1))
        echo "  $name ... ✅ $success/$total_batches"
      else
        fail=$((fail+1))
        echo "  $name ... ❌ ($fail)"
      fi
      sleep 0.3
    done
    log "远程导入: $success 成功, $fail 失败"
  fi

  # 清理
  rm -rf /tmp/d1_resume_$$
}

# --------------------------------------------------------------------------
# Step 3: 最终验证
# --------------------------------------------------------------------------
verify() {
  step "数据校验"
  cd "$API_DIR"

  echo -n "  本地 stocks: "
  echo $(npx wrangler d1 execute $DB_NAME --local \
    --command "SELECT COUNT(*) FROM stocks;" 2>/dev/null | \
    grep -oE '[0-9]+' | tail -1 || echo "0") 条

  echo -n "  本地 stock_daily: "
  echo $(npx wrangler d1 execute $DB_NAME --local \
    --command "SELECT COUNT(*) FROM stock_daily;" 2>/dev/null | \
    grep -oE '[0-9]+' | tail -1 || echo "0") 条

  if check_proxy; then
    echo -n "  远程 stocks: "
    echo $(npx wrangler d1 execute $DB_NAME --remote \
      --command "SELECT COUNT(*) FROM stocks;" 2>/dev/null | \
      grep -oE '[0-9]+' | tail -1 || echo "0") 条

    echo -n "  远程 stock_daily: "
    echo $(npx wrangler d1 execute $DB_NAME --remote \
      --command "SELECT COUNT(*) FROM stock_daily;" 2>/dev/null | \
      grep -oE '[0-9]+' | tail -1 || echo "0") 条
  fi
}

# --------------------------------------------------------------------------
# 主流程
# --------------------------------------------------------------------------
main() {
  echo ""
  echo "╔════════════════════════════════════════════════════╗"
  echo "║   YZInvest AI — 断点续传  $(date '+%Y-%m-%d %H:%M')           ║"
  echo "╚════════════════════════════════════════════════════╝"
  echo ""

  # 检测现有数据
  if ! detect_current; then
    verify
    echo ""
    log "无需续传，如需强制重刷请运行：./sync_all.sh"
    exit 0
  fi

  # 执行增量同步
  echo "是否继续增量同步？"
  read -p "输入 yes 继续，其他取消: " confirm
  if [ "$confirm" != "yes" ]; then
    info "取消操作"
    exit 0
  fi

  incremental_sync
  verify

  echo ""
  log "续传完成！🎉"
  info "提示：下次同步推荐运行 ./sync_all.sh（全量模式）"
}

main "$@"