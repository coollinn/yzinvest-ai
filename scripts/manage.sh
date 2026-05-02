#!/bin/bash
# 最后更新：2026.05.01
# ============================================================================
# YZInvest AI — 项目管理脚本
# 用法：
#   ./manage.sh start         # 启动本地服务（API Worker）
#   ./manage.sh stop        # 停止本地服务
#   ./manage.sh restart      # 重启
#   ./manage.sh status       # 查看服务状态
#   ./manage.sh test         # 测试 API 接口
#   ./manage.sh test-auth    # 测试登录
#   ./manage.sh sync-local   # 同步数据到本地数据库
#   ./manage.sh sync-remote  # 同步数据到远程数据库
#   ./manage.sh deploy       # 触发 CI/CD 部署到远程
#   ./manage.sh db-status    # 查看数据库状态
# ============================================================================
set -e

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API_DIR="$PROJECT_ROOT/apps/api"
API_PORT=8787
DB_NAME="yzinvest"
SCRIPTS_DIR="$PROJECT_ROOT/scripts"

# 颜色
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() { echo -e "${GREEN}[$(date '+%H:%M:%S')]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; }
info() { echo -e "${BLUE}[INFO]${NC} $1"; }

# ---------------------------------------------------------------------------
# 服务管理
# ---------------------------------------------------------------------------

start() {
  cd "$API_DIR"
  if lsof -i :$API_PORT -t > /dev/null 2>&1; then
    warn "端口 $API_PORT 已被占用，先停止旧进程..."
    stop
    sleep 2
  fi
  log "启动 wrangler dev (端口 $API_PORT)..."
  npx wrangler dev --port $API_PORT &
  log "✅ 服务已启动: http://localhost:$API_PORT"
  log "   API 文档: http://localhost:$API_PORT/"
  log "   健康检查: http://localhost:$API_PORT/health"
}

stop() {
  log "停止 wrangler dev..."
  pkill -f "wrangler dev" 2>/dev/null || true
  # 也杀掉占用端口的进程
  for pid in $(lsof -ti :$API_PORT 2>/dev/null || true); do
    kill -9 $pid 2>/dev/null || true
  done
  log "✅ 服务已停止"
}

restart() {
  stop
  sleep 2
  start
}

status() {
  info "检查服务状态..."
  if lsof -i :$API_PORT -t > /dev/null 2>&1; then
    log "✅ wrangler dev 运行中 (端口 $API_PORT)"
    echo ""
    echo "进程详情："
    ps aux | grep -E "wrangler|node" | grep -v grep | head -5
  else
    warn "wrangler dev 未运行"
  fi
  echo ""
  info "本地数据库: $API_DIR/.wrangler/state/v3/d1/"
  if [ -d "$API_DIR/.wrangler/state/v3/d1" ]; then
    echo "  $(ls "$API_DIR/.wrangler/state/v3/d1/" | wc -l | tr -d ' ') 个数据库"
  fi
}

# ---------------------------------------------------------------------------
# API 测试
# ---------------------------------------------------------------------------

get_token() {
  # 登录获取 token
  TOKEN=$(curl -s "http://localhost:$API_PORT/api/auth/login" \
    -H "Content-Type: application/json" \
    -d '{"username":"leon","password":"YzInvest2026!"}' \
    | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('access_token',''))" 2>/dev/null || echo "")
  echo "$TOKEN"
}

test() {
  info "测试 API 接口..."
  echo ""

  # 1. 健康检查
  echo -n "  健康检查: "
  result=$(curl -s "http://localhost:$API_PORT/health" | python3 -c "import sys,json; d=json.load(sys.stdin); print('✅' if d.get('status')=='healthy' else '❌')" 2>/dev/null || echo "❌")
  echo "$result"

  # 2. 获取 token
  TOKEN=$(get_token)
  if [ -z "$TOKEN" ]; then
    warn "无法获取 token，跳过认证接口测试"
    return
  fi
  echo "  Token: ${TOKEN:0:20}..."

  # 3. 测试股票列表
  echo -n "  股票列表: "
  result=$(curl -s "http://localhost:$API_PORT/api/stocks?page=1&limit=3" \
    -H "Authorization: Bearer $TOKEN" \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print(f\"✅ {d.get('data',{}).get('pagination',{}).get('total_items',0)} 条\")" 2>/dev/null || echo "❌")
  echo "$result"

  # 4. 测试股票搜索
  echo -n "  股票搜索 (贵州): "
  result=$(curl -s "http://localhost:$API_PORT/api/stocks/search?q=贵州&limit=3" \
    | python3 -c "import sys,json; d=json.load(sys.stdin); items=d.get('data',{}).get('items',[]); print(f\"✅ {len(items)} 条\")" 2>/dev/null || echo "❌")
  echo "$result"

  # 5. 测试股票详情
  echo -n "  股票详情 (600519.SH): "
  result=$(curl -s "http://localhost:$API_PORT/api/stocks/600519.SH/detail" \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print('✅' if d.get('success') else '❌')" 2>/dev/null || echo "❌")
  echo "$result"

  # 6. 测试 K线
  echo -n "  K线数据 (000001.SZ): "
  result=$(curl -s "http://localhost:$API_PORT/api/daily/000001.SZ?range=1M" \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print(f\"✅ {d.get('data',{}).get('count',0)} 条\")" 2>/dev/null || echo "❌")
  echo "$result"
}

test-auth() {
  info "测试登录..."
  TOKEN=$(get_token)
  if [ -z "$TOKEN" ]; then
    error "登录失败！检查用户名/密码或服务是否运行"
    exit 1
  fi
  log "✅ 登录成功！Token: ${TOKEN:0:30}..."

  # 测试获取用户信息
  echo -n "  获取用户信息: "
  result=$(curl -s "http://localhost:$API_PORT/api/auth/me" \
    -H "Authorization: Bearer $TOKEN" \
    | python3 -c "import sys,json; d=json.load(sys.stdin); u=d.get('data',{}); print(f\"✅ {u.get('username')} ({u.get('role')})\")" 2>/dev/null || echo "❌")
  echo "$result"
}

# ---------------------------------------------------------------------------
# 数据库操作
# ---------------------------------------------------------------------------

db_status() {
  info "数据库状态..."
  echo ""
  echo "【本地 D1】"
  cd "$API_DIR"
  npx wrangler d1 execute $DB_NAME --local --command "SELECT COUNT(*) as cnt FROM stocks;" 2>/dev/null | grep -E '"cnt"' || echo "  无法连接本地数据库"
  npx wrangler d1 execute $DB_NAME --local --command "SELECT COUNT(*) as cnt FROM stock_daily;" 2>/dev/null | grep -E '"cnt"' || echo "  无法连接本地数据库"
  echo ""
  echo "【远程 D1】（需要代理）"
  if require_proxy > /dev/null 2>&1; then
    npx wrangler d1 execute $DB_NAME --remote --command "SELECT COUNT(*) as cnt FROM stocks;" 2>/dev/null | grep -E '"cnt"' || echo "  无法连接远程数据库"
    npx wrangler d1 execute $DB_NAME --remote --command "SELECT COUNT(*) as cnt FROM stock_daily;" 2>/dev/null | grep -E '"cnt"' || echo "  无法连接远程数据库"
  else
    warn "代理未开启，跳过远程数据库查询"
  fi
}

db_reset_local() {
  warn "重置本地数据库（将删除所有本地数据）？"
  read -p "确认重置？ (yes/no): " confirm
  if [ "$confirm" = "yes" ]; then
    info "重置本地数据库..."
    cd "$API_DIR"
    rm -rf .wrangler/state/v3/d1/
    npx wrangler d1 migrations apply $DB_NAME --local
    log "✅ 本地数据库已重置"
  else
    info "取消操作"
  fi
}

db_query_local() {
  cd "$API_DIR"
  query="${1:-SELECT * FROM stocks LIMIT 3;}"
  npx wrangler d1 execute $DB_NAME --local --command "$query" 2>&1
}

# ---------------------------------------------------------------------------
# 数据同步
# ---------------------------------------------------------------------------

_sync_python() {
  local output="$1"
  log "运行 Python 数据获取脚本..."
  cd "$PROJECT_ROOT"
  python3 scripts/fetch_all_stocks.py "$output" 2>&1
}

sync_local() {
  info "同步数据到本地数据库..."

  # 1. 获取数据
  log "第1步：获取数据..."
  SQL_FILE="/tmp/stocks_sync_$(date +%Y%m%d_%H%M%S).sql"
  _sync_python "$SQL_FILE"

  if [ ! -s "$SQL_FILE" ]; then
    error "SQL 文件生成失败"
    return 1
  fi

  # 2. 重置本地数据库
  log "第2步：重置本地数据库..."
  cd "$API_DIR"
  rm -rf .wrangler/state/v3/d1/
  npx wrangler d1 migrations apply $DB_NAME --local 2>&1 | tail -3

  # 3. 导入数据（分批）
  log "第3步：导入数据（分批）..."
  python3 - <<'PYEOF'
import re, os
src = "/tmp/stocks_sync_$(date +%Y%m%d_%H%M%S).sql"
src = [f for f in os.listdir("/tmp") if f.startswith("stocks_sync_") and f.endswith(".sql")]
if not src: exit(1)
src = sorted(src, key=lambda x: os.path.getmtime("/tmp/"+x))[-1]
with open("/tmp/"+src) as f: content = f.read()
# 移除 BEGIN/COMMIT（D1 不支持）
content = re.sub(r'--.*?\n', '', content)
content = re.sub(r'BEGIN TRANSACTION;?\n?', '', content)
content = re.sub(r'\n?COMMIT;?', '', content)
os.makedirs('/tmp/sql_import', exist_ok=True)
# 分批 100 条
sqls = [s.strip() for s in content.split(';') if s.strip()]
for i in range(0, len(sqls), 100):
    batch = sqls[i:i+100]
    with open(f'/tmp/sql_import/batch_{i//100+1:03d}.sql', 'w') as f:
        for s in batch: f.write(s+';\n')
print(f"分 {len(sqls)//100+1} 批")
PYEOF

  # 4. 执行导入
  success=0; fail=0
  for f in /tmp/sql_import/batch_*.sql; do
    out=$(npx wrangler d1 execute $DB_NAME --local --file="$f" 2>&1)
    if echo "$out" | grep -q '"success": true'; then
      success=$((success+1))
    else
      fail=$((fail+1))
    fi
  done
  log "导入完成: $success 成功, $fail 失败"

  # 5. 验证
  db_status
}

sync_remote() {
  info "同步数据到远程数据库..."

  SQL_FILE="/tmp/stocks_sync_remote.sql"
  log "获取数据..."
  _sync_python "$SQL_FILE"

  if [ ! -s "$SQL_FILE" ]; then
    error "SQL 文件生成失败"
    return 1
  fi

  # 移除 BEGIN/COMMIT
  log "清理 SQL..."
  python3 -c "
import re
with open('$SQL_FILE') as f: content = f.read()
content = re.sub(r'--.*?\n', '', content)
content = re.sub(r'BEGIN TRANSACTION;?\n?', '', content)
content = re.sub(r'\n?COMMIT;?', '', content)
with open('$SQL_FILE', 'w') as f: f.write(content)
print('Done')
"

  # 清空远程旧数据
  log "清空远程旧数据..."
  cd "$API_DIR"
  npx wrangler d1 execute $DB_NAME --remote --command "DELETE FROM stock_daily; DELETE FROM stocks;" 2>&1 | tail -2

  # 分批导入
  log "导入数据到远程..."
  python3 - <<'PYEOF'
import re, os
with open('/tmp/stocks_sync_remote.sql') as f: content = f.read()
sqls = [s.strip() for s in content.split(';') if s.strip()]
os.makedirs('/tmp/remote_batches', exist_ok=True)
for i in range(0, len(sqls), 100):
    batch = sqls[i:i+100]
    with open(f'/tmp/remote_batches/batch_{i//100+1:03d}.sql', 'w') as f:
        for s in batch: f.write(s+';\n')
print(f"分 {(len(sqls)-1)//100+1} 批")
PYEOF

  success=0; fail=0
  for f in /tmp/remote_batches/batch_*.sql; do
    echo -n "  $(basename $f)... "
    out=$(npx wrangler d1 execute $DB_NAME --remote --file="$f" 2>&1)
    if echo "$out" | grep -qE '"success": true|🚣'; then
      echo "✅"; success=$((success+1))
    else
      echo "❌"; fail=$((fail+1))
    fi
    sleep 0.3
  done
  log "导入完成: $success 成功, $fail 失败"
  db_status
}

# ---------------------------------------------------------------------------
# 导入辅助函数
# ---------------------------------------------------------------------------

_import_to_local() {
  local sql_file="$1"
  # 停止 wrangler dev 避免文件锁
  if lsof -i :$API_PORT -t > /dev/null 2>&1; then
    warn "停止 wrangler dev 释放本地数据库锁..."
    stop
    sleep 2
  fi
  cd "$API_DIR"
  # 重置本地数据库
  rm -rf .wrangler/state/v3/d1/
  npx wrangler d1 migrations apply $DB_NAME --local 2>&1 | tail -1
  # 分批导入
  log "导入到本地数据库..."
  python3 -c "
import re, os
with open('$sql_file') as f: content = f.read()
content = re.sub(r'--.*?\n', '', content)
content = re.sub(r'BEGIN TRANSACTION;?\n?', '', content)
content = re.sub(r'\n?COMMIT;?', '', content)
sqls = [s.strip() for s in content.split(';') if s.strip()]
os.makedirs('/tmp/local_batches', exist_ok=True)
for i in range(0, len(sqls), 100):
    with open(f'/tmp/local_batches/b{i//100+1:03d}.sql','w') as f:
        for s in sqls[i:i+100]: f.write(s+';\n')
print(f'分{(len(sqls)-1)//100+1}批')
"
  success=0; fail=0
  for f in /tmp/local_batches/b*.sql; do
    out=$(npx wrangler d1 execute $DB_NAME --local --file="$f" 2>&1)
    echo "$out" | grep -q '"success": true' && success=$((success+1)) || fail=$((fail+1))
  done
  log "本地导入: $success 成功, $fail 失败"
}

require_proxy() {
  if ! curl -s --max-time 3 --noproxy "*" "https://api.cloudflare.com/" -o /dev/null 2>&1; then
    error "访问 Cloudflare API 失败，请先开启代理！"
    log "提示：导入远程数据库（--remote）需要代理访问 workers.dev"
    log "代理开启后重新运行即可"
    return 1
  fi
  return 0
}

_import_to_remote() {
  require_proxy || return 1
  local sql_file="$1"
  cd "$API_DIR"
  # 清空远程旧数据
  log "清空远程旧数据..."
  npx wrangler d1 execute $DB_NAME --remote --command "DELETE FROM stock_daily; DELETE FROM stocks;" 2>&1 | tail -1
  # 分批导入
  log "导入到远程数据库..."
  python3 -c "
import re, os
with open('$sql_file') as f: content = f.read()
content = re.sub(r'--.*?\n', '', content)
content = re.sub(r'BEGIN TRANSACTION;?\n?', '', content)
content = re.sub(r'\n?COMMIT;?', '', content)
sqls = [s.strip() for s in content.split(';') if s.strip()]
os.makedirs('/tmp/remote_batches', exist_ok=True)
for i in range(0, len(sqls), 100):
    with open(f'/tmp/remote_batches/b{i//100+1:03d}.sql','w') as f:
        for s in sqls[i:i+100]: f.write(s+';\n')
print(f'分{(len(sqls)-1)//100+1}批')
"
  success=0; fail=0
  for f in /tmp/remote_batches/b*.sql; do
    echo -n "  $(basename $f)... "
    out=$(npx wrangler d1 execute $DB_NAME --remote --file="$f" 2>&1)
    if echo "$out" | grep -qE '"success": true|🚣'; then echo "✅"; success=$((success+1))
    else echo "❌"; fail=$((fail+1)); fi
    sleep 0.3
  done
  log "远程导入: $success 成功, $fail 失败"
}

# ---------------------------------------------------------------------------
# Layer 1: 股票基础数据同步（手动，按季更新）
# ---------------------------------------------------------------------------

stock-sync() {
  info "同步股票基础数据 (Layer 1)..."
  log "来源: 东方财富全量行情 API (~12386 条)"
  log "频率: 每季度手动更新，或发现新股/退市时触发"
  log ""
  log "推荐命令（自动化脚本，无需人工干预）："
  log "  ./sync_all.sh        # 一键全量同步（本地+远程，推荐）"
  log "  ./sync_all.sh --local-only   # 仅同步本地"
  log "  ./sync_all.sh --skip-local   # 仅同步远程（需要代理）"
  log ""
  log "断点续传（如上次中断）："
  log "  ./sync_resume.sh     # 智能续传"
  log ""
  log "详细说明: docs/DATA_SYNC_MANUAL.md"

  SQL_FILE="/tmp/stocks_layer1_$(date +%Y%m%d).sql"
  log "获取数据 -> $SQL_FILE..."
  cd "$PROJECT_ROOT"
  python3 scripts/fetch_all_stocks.py "$SQL_FILE" 2>&1 | tail -3

  if [ ! -s "$SQL_FILE" ]; then
    error "SQL 文件生成失败"
    return 1
  fi

  STOCK_COUNT=$(grep -c "INSERT INTO stocks " "$SQL_FILE" || echo "0")
  DAILY_COUNT=$(grep -c "INSERT INTO stock_daily " "$SQL_FILE" || echo "0")
  info "生成: $STOCK_COUNT 条 stocks, $DAILY_COUNT 条 stock_daily"

  log ""
  read -p "导入到 [local/remote/both/skip]? " target
  case "$target" in
    local)   _import_to_local "$SQL_FILE" ;;
    remote)   _import_to_remote "$SQL_FILE" ;;
    both)     _import_to_local "$SQL_FILE"; _import_to_remote "$SQL_FILE" ;;
    *)        info "跳过导入，请手动使用 _import_to_local / _import_to_remote" ;;
  esac
  db_status
}

# ---------------------------------------------------------------------------
# Layer 2: 当日行情数据同步（每日增量）
# ---------------------------------------------------------------------------

daily-sync() {
  DATE="${2:-$(date +%Y%m%d)}"
  info "同步行情数据 (Layer 2) — 日期: $DATE"
  log "说明: docs/DATA_GUIDE.md 第 3.2 节"
  log "注意: 当前脚本 scripts/sync_daily_prices.py 待实现"
  log ""
  log "替代方案 — 全量行情（按日期）:"
  log "  东方财富 push2delay 接口每次最多 100 条，需循环拉取"
  log "  参考: scripts/fetch_all_stocks.py 中的 daily_sqls 生成逻辑"
}

# ---------------------------------------------------------------------------
# 部署
# ---------------------------------------------------------------------------

deploy() {
  info "触发 CI/CD 部署..."
  cd "$PROJECT_ROOT"

  if ! git rev-parse --git-dir > /dev/null 2>&1; then
    error "不是 git 仓库"
    return 1
  fi

  if ! git diff-index --quiet HEAD -- 2>/dev/null; then
    warn "有未提交的更改，是否继续？"
    read -p "确认部署 (yes/no): " confirm
    if [ "$confirm" != "yes" ]; then
      info "取消部署"
      return 0
    fi
  fi

  CURRENT_BRANCH=$(git branch --show-current)
  info "当前分支: $CURRENT_BRANCH"

  log "推送到 GitHub 触发 CI/CD..."
  git push origin $CURRENT_BRANCH 2>&1

  log "✅ 部署已触发！"
  log "   监控: https://github.com/yzinvest-ai/yzinvest-ai/actions"
}

# ---------------------------------------------------------------------------
# 主入口
# ---------------------------------------------------------------------------

CMD="${1:-}"

case "$CMD" in
  start)
    start
    ;;
  stop)
    stop
    ;;
  restart)
    restart
    ;;
  status)
    status
    ;;
  test)
    test
    ;;
  test-auth)
    test-auth
    ;;
  sync-all)
    "$SCRIPTS_DIR/sync_all.sh" "$@"
    ;;
  sync-incremental)
    shift
    "$SCRIPTS_DIR/sync_incremental.sh" "$@"
    ;;
  sync-resume)
    "$SCRIPTS_DIR/sync_resume.sh"
    ;;
  sync-local)
    sync_local
    ;;
  sync-remote)
    sync_remote
    ;;
  stock-sync)
    stock-sync
    ;;
  daily-sync)
    shift
    daily-sync "$@"
    ;;
  industry-sync)
    shift
    cd "$PROJECT_ROOT"
    python3 scripts/sync_industry.py "$@"
    ;;
  deploy)
    deploy
    ;;
  db-status|db)
    db_status
    ;;
  db-reset)
    db_reset_local
    ;;
  db-query)
    shift
    db_query_local "$*"
    ;;
  help|--help|-h)
    echo "YZInvest AI 管理脚本"
    echo ""
    echo "服务管理:"
    echo "  start         启动本地服务"
    echo "  stop          停止本地服务"
    echo "  restart       重启本地服务"
    echo "  status        查看服务状态"
    echo ""
    echo "测试:"
    echo "  test          测试 API 接口"
    echo "  test-auth     测试登录"
    echo ""
    echo "数据库:"
    echo "  db-status     查看本地/远程数据库状态"
    echo "  db-reset      重置本地数据库"
    echo "  db-query SQL  执行本地 SQL 查询"
    echo ""
    echo "数据同步:"
    echo "  stock-sync         全量股票数据同步 (Layer 1)"
    echo "  industry-sync      补充行业信息（沪深 A 股）"
    echo "  industry-sync --apply-local   写入本地 D1"
    echo "  daily-sync         当日行情数据同步 (Layer 2)"
    echo "数据同步:"
    echo "  sync-all         全自动同步（fetch + 本地 + 远程，推荐）"
    echo "  sync-incremental 增量同步（仅同步变化部分，推荐日常使用）"
    echo "  sync-resume      断点续传（上次中断后补漏）"
    echo "  sync-local       获取数据并同步到本地数据库"
    echo "  sync-remote      获取数据并同步到远程数据库"
    echo ""
    echo "部署:"
    echo "  deploy        触发 CI/CD 部署到远程"
    ;;
  *)
    error "未知命令: $CMD"
    echo "运行 ./manage.sh help 查看帮助"
    exit 1
    ;;
esac
