import { verifyAdmin } from "@/lib/dal";
import { getPodConfig } from "@/lib/pod-config";
import PodManager from "./PodManager";

export default async function PodsPage() {
  await verifyAdmin();
  const config = getPodConfig();
  return <PodManager initialConfig={config} />;
}
