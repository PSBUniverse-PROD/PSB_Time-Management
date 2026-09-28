import { loadBookManifest, loadSection } from "../data/documentation.actions";
import DocumentationView from "./DocumentationView";
export default async function DocumentationPage() {
  const manifest = await loadBookManifest();
  const initialSection = await loadSection("rules");

  return (
    <DocumentationView
      manifest={manifest}
      initialSection={initialSection}
    />
  );
}
