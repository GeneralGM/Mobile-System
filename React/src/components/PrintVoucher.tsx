import type { Voucher } from "@/lib/store";

export function PrintVoucher({ voucher }: { voucher: Voucher }) {
  const isEntry = voucher.type === "entry";
  return (
    <div className="print-voucher border border-black p-3 mb-3">
      <div className="flex justify-between items-center border-b border-black pb-2 mb-2">
        <h2 className="text-base font-bold">
          {isEntry ? "إذن توريد / دخول" : "إذن صرف"}
        </h2>
        <div className="text-xs">
          <div>التاريخ: {voucher.date}</div>
          <div>رقم الإذن: {voucher.id.slice(0, 8).toUpperCase()}</div>
        </div>
      </div>
      <div className="text-xs mb-2">
        {isEntry ? (
          <span>المورد: <strong>{(voucher as any).supplier || "—"}</strong></span>
        ) : (
          <span>القسم: <strong>{(voucher as any).department}</strong></span>
        )}
      </div>
      <table className="print-table w-full">
        <thead>
          <tr>
            <th style={{ width: "30px" }}>#</th>
            <th>اسم الصنف</th>
            <th style={{ width: "60px" }}>الوحدة</th>
            <th style={{ width: "60px" }}>الكمية</th>
            {isEntry && <th style={{ width: "70px" }}>السعر</th>}
            {isEntry && <th style={{ width: "80px" }}>الإجمالي</th>}
          </tr>
        </thead>
        <tbody>
          {voucher.lines.map((l, i) => (
            <tr key={i}>
              <td>{i + 1}</td>
              <td>{l.itemName}</td>
              <td>{l.unit}</td>
              <td>{l.qty}</td>
              {isEntry && <td>{l.price?.toFixed(2)}</td>}
              {isEntry && <td>{((l.price || 0) * l.qty).toFixed(2)}</td>}
            </tr>
          ))}
        </tbody>
        {isEntry && (
          <tfoot>
            <tr>
              <td colSpan={5} style={{ textAlign: "left", fontWeight: "bold" }}>الإجمالي الكلي:</td>
              <td style={{ fontWeight: "bold" }}>
                {voucher.lines.reduce((s, l) => s + (l.price || 0) * l.qty, 0).toFixed(2)}
              </td>
            </tr>
          </tfoot>
        )}
      </table>
      <div className="flex justify-between mt-4 text-xs">
        <div>توقيع المستلم: ____________</div>
        <div>توقيع المسؤول: ____________</div>
      </div>
    </div>
  );
}
