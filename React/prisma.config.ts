/* eslint-disable prettier/prettier */
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: "postgresql://postgres:123456@localhost:5432/pos_db",
  },
});
