/**
 * 巨潮资讯网（cninfo.com.cn）公告/财务报表 PDF 元数据抓取
 * 不下载 PDF，只获取公告元数据（title/pdf_url/date），PDF 通过外链访问。
 */

export interface CninfoReport {
  announcementId: string;
  secCode: string;
  secName: string;
  title: string;
  announcementTime: string; // 公告日期 YYYY-MM-DD
  pdfUrl: string;
  fileSize: number; // KB
  reportType: string; // 年报/半年报/一季报/三季报/摘要
  reportPeriod: string; // 2025Q4
}

const CNINFO_ANNOUNCE = "http://www.cninfo.com.cn/new/hisAnnouncement/query";
const CNINFO_PDF_BASE = "http://static.cninfo.com.cn";

/**
 * 解析公告标题为报告类型和报告期
 * 如："2025年年度报告" → { type: "年报", period: "2025Q4" }
 */
function parseReportType(title: string): {
  reportType: string;
  reportPeriod: string;
} {
  const y = title.match(/(\d{4})年.*?报告/);
  const year = y ? y[1] : "";

  if (title.includes("年度报告")) {
    return { reportType: "年报", reportPeriod: `${year}Q4` };
  }
  if (title.includes("半年度报告")) {
    return { reportType: "半年报", reportPeriod: `${year}Q2` };
  }
  if (title.includes("一季度报告")) {
    return { reportType: "一季报", reportPeriod: `${year}Q1` };
  }
  if (title.includes("三季度报告")) {
    return { reportType: "三季报", reportPeriod: `${year}Q3` };
  }
  if (title.includes("年度报告摘要")) {
    return { reportType: "摘要", reportPeriod: `${year}Q4` };
  }
  if (title.includes("半年度报告摘要")) {
    return { reportType: "摘要", reportPeriod: `${year}Q2` };
  }
  if (title.includes("审计报告")) {
    return { reportType: "审计报告", reportPeriod: `${year}Q4` };
  }
  return { reportType: "其他", reportPeriod: "" };
}

/**
 * 从巨潮拉取单只股票的公告列表
 * @param secCode  股票代码，如 "300394"
 * @param orgId    cninfo orgId，如 "9900023911"
 * @param pageSize 每页条数（默认50）
 */
export async function fetchCninfoReports(
  secCode: string,
  orgId: string,
  pageSize = 50
): Promise<CninfoReport[]> {
  const allReports: CninfoReport[] = [];

  for (let pageNum = 1; pageNum <= 3; pageNum++) {
    try {
      const body = new URLSearchParams({
        pageNum: String(pageNum),
        pageSize: String(pageSize),
        column: secCode.startsWith("3") || secCode.startsWith("0") ? "szse" : "sse",
        tabName: "fulltext",
        stock: `${secCode},${orgId}`,
        category:
          "category_ndbg_szsh;category_bndbg_szsh;category_yjdbg_szsh;category_sjdbg_szsh",
        isHLtitle: "true",
      });

      const res = await fetch(CNINFO_ANNOUNCE, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Referer: `http://www.cninfo.com.cn/new/disclosure/stock?stockCode=${secCode}&orgId=${orgId}`,
        },
        body: body.toString(),
      });

      if (!res.ok) break;

      const json = (await res.json()) as {
        totalAnnouncement?: number;
        announcements?: Array<{
          announcementId: string;
          secCode: string;
          secName: string;
          announcementTitle: string;
          announcementTime: number; // ms timestamp
          adjunctUrl: string;
          adjunctSize: number;
        }>;
      };

      const items = json.announcements ?? [];
      if (items.length === 0) break;

      for (const item of items) {
        const { reportType, reportPeriod } = parseReportType(item.announcementTitle);
        const date = new Date(item.announcementTime).toISOString().substring(0, 10);

        allReports.push({
          announcementId: String(item.announcementId),
          secCode: item.secCode,
          secName: item.secName,
          title: item.announcementTitle,
          announcementTime: date,
          pdfUrl: `${CNINFO_PDF_BASE}/${item.adjunctUrl}`,
          fileSize: item.adjunctSize,
          reportType,
          reportPeriod,
        });
      }

      // 如果本页不足 pageSize 说明已是最后一页
      if (items.length < pageSize) break;
    } catch {
      break;
    }
  }

  return allReports;
}

/**
 * cninfo 股票代码 → orgId 映射缓存
 * 深市：szse_stock.json，沪市：sse_stock.json
 */
export async function fetchCninfoOrgId(secCode: string): Promise<string | null> {
  try {
    const isSz = secCode.startsWith("0") || secCode.startsWith("3");
    const jsonUrl = isSz
      ? "http://www.cninfo.com.cn/new/data/szse_stock.json"
      : "http://www.cninfo.com.cn/new/data/sse_stock.json";

    const res = await fetch(jsonUrl, {
      headers: { Referer: "http://www.cninfo.com.cn/" },
    });
    if (!res.ok) return null;

    const json = (await res.json()) as {
      stockList?: Array<{ code: string; orgId: string }>;
    };

    const found = json.stockList?.find((s) => s.code === secCode);
    return found?.orgId ?? null;
  } catch {
    return null;
  }
}
