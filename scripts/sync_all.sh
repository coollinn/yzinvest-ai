#!/bin/bash
# 最后更新：2026.05.01
# ============================================================================
# YZInvest AI — 全自动数据同步脚本
# 功能：拉取东方财富全量A股数据 → 写入本地 D1 + 远程 D1
# 用法：./sync_all.sh [--local-only] [--skip-local]
# ============================================================================
set -e

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API_DIR="$PROJECT_ROOT/apps/api"
DB_NAME="yzinvest"
FETCH_SCRIPT="$PROJECT_ROOT/scripts/fetch_all_stocks.py"

# --------------------------------------------------------------------------
# 参数解析
# --------------------------------------------------------------------------
MODE="both"   # both | local-only | remote-only
for arg in "$@"; do
  case "$arg" in
    --local-only)  MODE="local-only" ;;
    --skip-local)  MODE="remote-only" ;;
  esac
done

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
# 工具函数
# --------------------------------------------------------------------------

# 检测代理（用于远程 D1 操作）
check_proxy() {
  if curl -s --max-time 4 --noproxy "*" \
    "https://api.cloudflare.com/" -o /dev/null 2>&1; then
    return 0
  else
    return 1
  fi
}

# 停止 wrangler dev（避免本地 D1 文件锁）
stop_wrangler() {
  info "检查 wrangler dev 进程..."
  if lsof -i :8787 -t > /dev/null 2>&1; then
    warn "发现 wrangler dev 占用端口 8787，停止..."
    pkill -f "wrangler dev" 2>/dev/null || true
    for pid in $(lsof -ti :8787 2>/dev/null || true); do
      kill -9 "$pid" 2>/dev/null || true
    done
    sleep 2
    log "wrangler dev 已停止"
  else
    info "wrangler dev 未运行，跳过"
  fi
}

# 清理旧批次文件
clean_batches() {
  rm -rf /tmp/d1_batches_$$
  mkdir -p /tmp/d1_batches_$$
}

# 将 SQL 文件分批（100条/批）
split_sql() {
  local sql_file="$1"
  clean_batches

  python3 - << PYEOF
import re, os

sql_file = "$sql_file"
batch_dir = "/tmp/d1_batches_$$"

with open(sql_file, encoding="utf-8") as f:
    content = f.read()

# 移除 D1 不兼容的语句
content = re.sub(r'--[^\n]*\n', '\n', content)
content = re.sub(r'\n--[^\n]*', '', content)
content = re.sub(r'BEGIN TRANSACTION;?\n?', '', content, flags=re.IGNORECASE)
content = re.sub(r'\n?COMMIT;?', '', content, flags=re.IGNORECASE)

# 按分号拆分成独立语句
raw_sqls = [s.strip() for s in content.split(';') if s.strip() and len(s.strip()) > 20]

BATCH = 100
total = len(raw_sqls)
for i in range(0, total, BATCH):
    batch = raw_sqls[i:i+BATCH]
    n = i // BATCH + 1
    path = f"{batch_dir}/batch_{n:03d}.sql"
    with open(path, "w", encoding="utf-8") as f:
        f.write(";\n".join(batch) + ";\n")

print(f"SPLIT:{total}:{(total-1)//BATCH+1}")
PYEOF
}

# 执行本地 D1 批量导入
import_local() {
  step "导入本地 D1"
  cd "$API_DIR"

  # 重置本地数据库
  log "重置本地 D1（删除旧数据 + 执行 migrations）..."
  rm -rf .wrangler/state/v3/d1/
  npx wrangler d1 migrations apply $DB_NAME --local 2>&1 | tail -3

  # 分批导入
  local batch_dir="/tmp/d1_batches_$$"
  local success=0 fail=0
  local total_batches
  total_batches=$(find "$batch_dir" -name "batch_*.sql" | wc -l | tr -d ' ')
  log "共 $total_batches 批，开始导入..."

  for f in "$batch_dir"/batch_*.sql; do
    local name
    name=$(basename "$f")
    local out
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
  [ "$fail" -eq 0 ] || warn "存在失败批次，建议检查"
}

# 执行远程 D1 批量导入
import_remote() {
  step "导入远程 D1"

  if ! check_proxy; then
    error "代理未开启，无法访问 workers.dev！"
    info "请开启代理后重新运行：./sync_all.sh --skip-local"
    return 1
  fi
  log "代理已就绪 ✅"

  cd "$API_DIR"

  # 清空远程旧数据
  log "清空远程旧数据..."
  npx wrangler d1 execute $DB_NAME --remote \
    --command "DELETE FROM stock_daily; DELETE FROM stocks;" 2>&1 | tail -2

  # 分批导入
  local batch_dir="/tmp/d1_batches_$$"
  local success=0 fail=0
  local total_batches
  total_batches=$(find "$batch_dir" -name "batch_*.sql" | wc -l | tr -d ' ')
  log "共 $total_batches 批，开始导入（远程，请耐心等待）..."

  for f in "$batch_dir"/batch_*.sql; do
    local name
    name=$(basename "$f")
    echo -ne "  $name ... "
    local out
    out=$(npx wrangler d1 execute $DB_NAME --remote --file="$f" 2>&1)
    if echo "$out" | grep -qE '"success": true|Success|✅'; then
      success=$((success+1))
      echo "✅ $success/$total_batches"
    else
      fail=$((fail+1))
      echo "❌ ($fail)"
    fi
    sleep 0.3
  done
  log "远程导入: $success 成功, $fail 失败"
  [ "$fail" -eq 0 ] || warn "存在失败批次，建议稍后重试 sync_resume.sh"
}

# 验证数据
verify() {
  step "数据校验"
  echo ""

  # 本地
  echo -n "  本地 stocks: "
  local local_stocks
  local_stocks=$(cd "$API_DIR" && \
    npx wrangler d1 execute $DB_NAME --local \
    --command "SELECT COUNT(*) FROM stocks;" 2>/dev/null | \
    grep -oE '[0-9]+' | tail -1 || echo "0")
  echo "$local_stocks 条"

  echo -n "  本地 stock_daily: "
  local local_daily
  local_daily=$(cd "$API_DIR" && \
    npx wrangler d1 execute $DB_NAME --local \
    --command "SELECT COUNT(*) FROM stock_daily;" 2>/dev/null | \
    grep -oE '[0-9]+' | tail -1 || echo "0")
  echo "$local_daily 条"

  # 远程
  if check_proxy; then
    echo -n "  远程 stocks: "
    local remote_stocks
    remote_stocks=$(cd "$API_DIR" && \
      npx wrangler d1 execute $DB_NAME --remote \
      --command "SELECT COUNT(*) FROM stocks;" 2>/dev/null | \
      grep -oE '[0-9]+' | tail -1 || echo "0")
    echo "$remote_stocks 条"

    echo -n "  远程 stock_daily: "
    local remote_daily
    remote_daily=$(cd "$API_DIR" && \
      npx wrangler d1 execute $DB_NAME --remote \
      --command "SELECT COUNT(*) FROM stock_daily;" 2>/dev/null | \
      grep -oE '[0-9]+' | tail -1 || echo "0")
    echo "$remote_daily 条"
  else
    warn "代理未开启，跳过远程校验"
  fi

  echo ""
  if [ "$MODE" = "local-only" ] || ! check_proxy; then
    log "✅ 同步完成（本地模式）"
  else
    if [ "$local_stocks" = "$remote_stocks" ]; then
      log "✅ 两边 stocks 数量一致"
    else
      warn "⚠️ stocks 数量不一致（本地=$local_stocks, 远程=$remote_stocks）"
    fi
  fi
}

# --------------------------------------------------------------------------
# 主流程
# --------------------------------------------------------------------------
main() {
  echo ""
  echo "╔══════════════════════════════════════════════════════╗"
  echo "║     YZInvest AI — 全自动数据同步  $(date '+%Y-%m-%d %H:%M')     ║"
  echo "╚══════════════════════════════════════════════════════╝"
  echo ""

  # ── Step 1: 前置准备
  step "前置准备"
  stop_wrangler

  # ── Step 2: 拉取数据
  step "拉取东方财富全量数据"
  local SQL_FILE="/tmp/stocks_full_$(date +%Y%m%d_%H%M%S).sql"
  log "保存至: $SQL_FILE"

  cd "$PROJECT_ROOT"
  python3 "$FETCH_SCRIPT" "$SQL_FILE" --json 2>&1

  if [ ! -s "$SQL_FILE" ]; then
    error "SQL 文件生成失败！"
    exit 1
  fi

  local stock_cnt daily_cnt
  stock_cnt=$(grep -c "INSERT INTO stocks " "$SQL_FILE" 2>/dev/null || echo "0")
  daily_cnt=$(grep -c "INSERT INTO stock_daily " "$SQL_FILE" 2>/dev/null || echo "0")
  info "获取完成: stocks=$stock_cnt, daily=$daily_cnt"

  # ── Step 3: 分批处理
  step "分批处理 SQL"
  local split_result
  split_result=$(split_sql "$SQL_FILE")
  local total_sqls total_batches
  total_sqls=$(echo "$split_result" | cut -d: -f2)
  total_batches=$(echo "$split_result" | cut -d: -f3)
  log "拆分完成: $total_sqls 条 SQL, $total_batches 批"

  # ── Step 4: 导入本地
  if [ "$MODE" != "remote-only" ]; then
    import_local
  fi

  # ── Step 5: 导入远程
  if [ "$MODE" = "both" ]; then
    if check_proxy; then
      import_remote
    else
      warn "代理未开启，跳过远程导入"
      info "开启代理后运行以下命令补充远程数据："
      info "  ./sync_all.sh --skip-local"
    fi
  fi

  # ── Step 6: 验证
  verify

  # 清理
  rm -rf /tmp/d1_batches_$$
  echo ""
  log "全部完成！🎉"
}

main "$@"
