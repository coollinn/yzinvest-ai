#!/bin/bash
# 批量导入 SQL 文件到远程 D1 数据库
set -e

cd "$(dirname "$0")/../apps/api"

DB_NAME="yzinvest"
BATCH_DIR="/tmp/sql_batches"
TOTAL_BATCHES=$(ls $BATCH_DIR/batch_*.sql 2>/dev/null | wc -l | tr -d ' ')

echo "=== 远程数据库批量导入 ==="
echo "总批数: $TOTAL_BATCHES"
echo ""

success=0
fail=0
for f in $BATCH_DIR/batch_*.sql; do
    batch=$(basename "$f" .sql)
    echo -n "  $batch... "

    # 检查 wrangler 进程数，避免并发
    while true; do
        running=$(ps aux | grep "wrangler d1" | grep -v grep | wc -l | tr -d ' ')
        if [ "$running" -lt 3 ]; then
            break
        fi
        sleep 2
    done

    output=$(npx wrangler d1 execute $DB_NAME --remote --file="$f" 2>&1)
    if echo "$output" | grep -q "success.*true\|🚣.*successfully"; then
        echo "✅"
        success=$((success+1))
    else
        echo "❌"
        echo "$output" | head -5
        fail=$((fail+1))
    fi
    sleep 1
done

echo ""
echo "=== 完成 ==="
echo "成功: $success"
echo "失败: $fail"

echo ""
echo "=== 验证远程数据 ==="
npx wrangler d1 execute $DB_NAME --remote --command "SELECT COUNT(*) as cnt FROM stocks; SELECT COUNT(*) as daily_cnt FROM stock_daily;" 2>&1 | grep -E '"cnt"|"daily_cnt"'
