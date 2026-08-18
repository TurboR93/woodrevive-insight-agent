import type { Metadata } from "next";
import { WoodReviveAgent } from "./WoodReviveAgent";

export const metadata: Metadata = {
  title: { absolute: "WoodRevive Insight" },
  description: "Assistente operativo per documentazione, vendite e magazzino WoodRevive.",
};

export default function Home() {
  return <WoodReviveAgent />;
}
