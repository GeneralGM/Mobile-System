import type { SubDept, Item, Meal } from "@/lib/store";

export function PrintAuditSheet({
  date,
  department,
  items,
}: {
  date: string;
  department: SubDept;
  items: { item: Item; expected: number }[];
}) {
  return (
    <div className="print-voucher p-2">
      <div className="text-center border-b border-black pb-2 mb-2">
        <h1 className="text-base font-bold">الجرد الخاص ب {department}</h1>
        <div className="text-xs">عدد الأصناف: {items.length}</div>
      </div>
      <table className="print-table w-full">
        <thead>
          <tr>
            <th>اسم الصنف</th>
            <th style={{ width: "50px" }}>الوحدة</th>
            <th style={{ width: "30px" }}>تم</th>
            <th style={{ width: "110px" }}>الكمية الفعلية</th>
          </tr>
        </thead>
        <tbody>
          {items.map((r, i) => (
            <tr key={r.item.id}>
              <td>{r.item.name}</td>
              <td>{r.item.unit}</td>
              <td style={{ textAlign: "center" }}>◯</td>
              <td>[&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;]</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex justify-between mt-4 text-xs">
        <div>اسم القائم بالجرد: ____________</div>
        <div>التوقيع: ____________</div>
      </div>
      <div className="mt-2 text-center text-sm">{date} </div>
    </div>
  );
}

export function MealsByDept(meals: Meal[], dept: SubDept) {
  return meals.filter((m) => m.department === dept);
}
