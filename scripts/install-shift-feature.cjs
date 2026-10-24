const fs = require("node:fs");
const path = require("node:path");

// Run from E:\BMO-System\mobile system after extracting this package into the project root.
const projectRoot = process.cwd();
const packageRoot = path.resolve(__dirname, "..");
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

const fileCopies = [
  {
    source: path.join(packageRoot, "files", "mall-backend", "server.js"),
    destination: path.join(projectRoot, "mall-backend", "server.js"),
    name: "mall-backend\\server.js",
  },
  {
    source: path.join(packageRoot, "files", "React", "src", "lib", "api-client.ts"),
    destination: path.join(projectRoot, "React", "src", "lib", "api-client.ts"),
    name: "React\\src\\lib\\api-client.ts",
  },
  {
    source: path.join(packageRoot, "files", "React", "src", "routes", "shifts.tsx"),
    destination: path.join(projectRoot, "React", "src", "routes", "shifts.tsx"),
    name: "React\\src\\routes\\shifts.tsx",
  },
];

const linkPatches = [
  {
    file: path.join(projectRoot, "React", "src", "routes", "sales.tsx"),
    anchor: '<Link to="/invoices" className="app-btn-secondary">',
    link: '<Link to="/shifts" className="app-btn-secondary">الشيفت والمحاسبة <ChevronLeft size={16} /></Link>\n            ',
    name: "React\\src\\routes\\sales.tsx",
  },
  {
    file: path.join(projectRoot, "React", "src", "routes", "transfers.tsx"),
    anchor: '<Link to="/transfer-history"',
    link: '<Link to="/shifts" className="inline-flex items-center gap-2 rounded-xl border bg-card px-4 py-2.5 text-sm font-bold transition hover:bg-muted">الشيفت والمحاسبة <ChevronLeft size={15} /></Link>\n          ',
    name: "React\\src\\routes\\transfers.tsx",
  },
];

function fail(message) {
  console.error(`توقّف التثبيت قبل تعديل الملفات: ${message}`);
  process.exit(1);
}

// Preflight everything first so a wrong working directory does not create a partial install.
for (const item of fileCopies) {
  if (!fs.existsSync(item.source)) fail(`ملف التحديث غير موجود: ${item.source}`);
  if (!fs.existsSync(path.dirname(item.destination))) fail(`مجلد المشروع غير موجود: ${path.dirname(item.destination)}`);
  if (item.name.endsWith("shifts.tsx") && fs.existsSync(item.destination)) {
    // Existing shifts.tsx may be a previous partial attempt; preserve a backup, then replace it.
  } else if (!item.name.endsWith("shifts.tsx") && !fs.existsSync(item.destination)) {
    fail(`لم أجد الملف الحالي ${item.name}. تأكد أنك شغّلت الأمر من مجلد المشروع الرئيسي.`);
  }
}

const patchedLinks = [];
for (const item of linkPatches) {
  if (!fs.existsSync(item.file)) fail(`لم أجد ${item.name}.`);
  const source = fs.readFileSync(item.file, "utf8");
  if (source.includes('to="/shifts"')) {
    patchedLinks.push({ ...item, source, next: source, skip: true });
    continue;
  }
  const index = source.indexOf(item.anchor);
  if (index < 0 || source.indexOf(item.anchor, index + item.anchor.length) >= 0) {
    fail(`لم أتعرف على مكان إضافة رابط الشيفت في ${item.name}. لم يتم استبدال أي ملف.`);
  }
  patchedLinks.push({ ...item, source, next: source.slice(0, index) + item.link + source.slice(index), skip: false });
}

const toBackup = new Set([
  ...fileCopies.filter((item) => fs.existsSync(item.destination)).map((item) => item.destination),
  ...patchedLinks.filter((item) => !item.skip).map((item) => item.file),
]);
for (const destination of toBackup) {
  const backup = `${destination}.before-shifts-${timestamp}.bak`;
  fs.copyFileSync(destination, backup);
  console.log(`نسخة احتياطية: ${backup}`);
}

try {
  for (const item of fileCopies) {
    fs.copyFileSync(item.source, item.destination);
    console.log(`تم تحديث ${item.name}`);
  }
  for (const item of patchedLinks) {
    if (!item.skip) {
      fs.writeFileSync(item.file, item.next, "utf8");
      console.log(`تم إضافة رابط الشيفت إلى ${item.name}`);
    } else {
      console.log(`رابط الشيفت موجود بالفعل في ${item.name}`);
    }
  }
  console.log("\nاكتمل تثبيت ملفات الشيفت. قاعدة البيانات يجب أن تكون قد تم تحديثها بملف database\\employee-shifts.sql قبل التشغيل.");
} catch (error) {
  console.error("حدث خطأ أثناء النسخ. الملفات الأصلية لها نسخ احتياطية باسم before-shifts.");
  console.error(error);
  process.exit(2);
}
