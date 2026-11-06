import DealerLoginView from "./DealerLoginView";
import { loadPsbContact } from "../data/psbContact";

export default async function DealerLoginPage() {
  const psbContact = await loadPsbContact();
  return <DealerLoginView supportEmail={psbContact?.email || ""} />;
}
