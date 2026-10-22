// Hand-written (not generated): gives every /dealer page the dealer tab icon
// and title. gen:routes only manages page.js files and leaves this alone.
import dealerIcon from "@/styles/psb_dealer_icon.svg";

export const metadata = {
  title: "PSBUniverse Dealer Portal",
  description: "PSBUniverse dealer account portal",
  icons: {
    icon: [{ url: dealerIcon.src, type: "image/svg+xml" }],
  },
};

export default function DealerLayout({ children }) {
  return children;
}
