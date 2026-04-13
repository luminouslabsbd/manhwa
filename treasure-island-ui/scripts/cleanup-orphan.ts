import { prisma } from "../src/lib/prisma";

async function main() {
  const id = "a4c5225a-393c-46fe-88ba-5f4d8266344f";
  await prisma.character.deleteMany({ where: { project_id: id } });
  await prisma.project.delete({ where: { id } }).catch(() => console.log("project not found"));
  console.log("done");
}

main().finally(() => prisma.$disconnect());
