/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Voucher, IssueVoucher, Department } from "@/lib/store";

interface AggLine {
  itemName: string;
  unit: string;
  qty: number;
  totalValue: number;
  count: number;
}

function aggregate(vouchers: Voucher[]): AggLine[] {
  const map = new Map<string, AggLine>();
  for (const v of vouchers) {
    for (const l of v.lines) {
      const key = l.itemName + "|" + l.unit;
      const cur = map.get(key) || {
        itemName: l.itemName,
        unit: l.unit,
        qty: 0,
        totalValue: 0,
        count: 0,
      };
      cur.qty += l.qty;
      cur.totalValue += (l.price || 0) * l.qty;
      cur.count += 1;
      map.set(key, cur);
    }
  }
  return Array.from(map.values()).sort((a, b) =>
    a.itemName.localeCompare(b.itemName, "ar"),
  );
}

function EntryTable({
  lines,
  vouchersCount,
}: {
  lines: AggLine[];
  vouchersCount: number;
}) {
  const totalQty = lines.reduce((s, l) => s + l.qty, 0);
  const totalValue = lines.reduce((s, l) => s + l.totalValue, 0);
  return (
    <table className="print-table w-full">
      <thead>
        <tr>
          <th style={{ width: "30px" }}>#</th>
          <th>اسم الصنف</th>
          <th style={{ width: "60px" }}>الوحدة</th>
          <th style={{ width: "70px" }}>إجمالي الكمية</th>
          <th style={{ width: "50px" }}>عدد الأذونات</th>
          <th style={{ width: "90px" }}>الإجمالي (قيمة)</th>
        </tr>
      </thead>
      <tbody>
        {lines.map((l, i) => (
          <tr key={i}>
            <td>{i + 1}</td>
            <td>{l.itemName}</td>
            <td>{l.unit}</td>
            <td>{l.qty}</td>
            <td>{l.count}</td>
            <td>{l.totalValue.toFixed(2)}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <td colSpan={3} style={{ textAlign: "left", fontWeight: "bold" }}>
            الإجماليات:
          </td>
          <td style={{ fontWeight: "bold" }}>{totalQty}</td>
          <td style={{ fontWeight: "bold" }}>{vouchersCount}</td>
          <td style={{ fontWeight: "bold" }}>{totalValue.toFixed(2)}</td>
        </tr>
      </tfoot>
    </table>
  );
}

function IssueDeptBlock({
  dept,
  vouchers,
}: {
  dept: Department;
  vouchers: IssueVoucher[];
}) {
  const lines = aggregate(vouchers);
  if (lines.length === 0) return null;
  const totalQty = lines.reduce((s, l) => s + l.qty, 0);
  return (
    <div style={{ marginBottom: "6px" }}>
      <div
        style={{ fontWeight: "bold", fontSize: "12px", margin: "4px 0 2px" }}
      >
        القسم: {dept} — عدد الأذونات: {vouchers.length}
      </div>
      <table className="print-table w-full">
        <thead>
          <tr>
            <th style={{ width: "30px" }}>#</th>
            <th>اسم الصنف</th>
            <th style={{ width: "60px" }}>الوحدة</th>
            <th style={{ width: "70px" }}>إجمالي الكمية</th>
            <th style={{ width: "60px" }}>عدد الأذونات</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i}>
              <td>{i + 1}</td>
              <td>{l.itemName}</td>
              <td>{l.unit}</td>
              <td>{l.qty}</td>
              <td>{l.count}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={3} style={{ textAlign: "left", fontWeight: "bold" }}>
              إجمالي {dept}:
            </td>
            <td style={{ fontWeight: "bold" }}>{totalQty}</td>
            <td style={{ fontWeight: "bold" }}>{vouchers.length}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

const DEPT_ORDER: Department[] = ["مطبخ", "بار", "صالة"];

export function PrintReport({
  vouchers,
  title,
  subtitle,
}: {
  vouchers: Voucher[];
  title: string;
  subtitle: string;
}) {
  if (vouchers.length === 0) return null;
  const isEntry = vouchers[0].type === "entry";

  const parties = isEntry
    ? Array.from(new Set(vouchers.map((v) => (v as any).supplier))).join("، ")
    : Array.from(new Set(vouchers.map((v) => (v as any).department))).join(
        "، ",
      );

  return (
    <div className="print-voucher">
      <div className="text-center border-b border-black pb-2 mb-2">
        <h1 className="text-base font-bold">{title}</h1>
        <div className="text-xs">{subtitle}</div>
        <div className="text-xs mt-1">
          نوع التقرير:{" "}
          <strong>{isEntry ? "أذونات توريد" : "أذونات صرف"}</strong> • عدد
          الأذونات: <strong>{vouchers.length}</strong> •
          {isEntry ? " الموردون: " : " الأقسام: "}
          <strong>{parties || "—"}</strong>
        </div>
      </div>

      {isEntry ? (
        <EntryTable
          lines={aggregate(vouchers)}
          vouchersCount={vouchers.length}
        />
      ) : (
        <>
          {DEPT_ORDER.map((dept, idx) => {
            const deptVouchers = (vouchers as IssueVoucher[]).filter(
              (v) => v.department === dept,
            );
            if (deptVouchers.length === 0) return null;
            const isLastWithData = DEPT_ORDER.slice(idx + 1).every(
              (d) =>
                (vouchers as IssueVoucher[]).filter((v) => v.department === d)
                  .length === 0,
            );
            return (
              <div key={dept}>
                <IssueDeptBlock dept={dept} vouchers={deptVouchers} />
                {!isLastWithData && (
                  <hr
                    style={{
                      border: "none",
                      borderTop: "2px solid #000",
                      margin: "6px 0",
                    }}
                  />
                )}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
