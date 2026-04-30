import { OrderbookWidget } from "@/components/OrderbookWidget";
import { LagRadar } from "@/components/LagRadar";

export default function Page() {
  return (
    <main className="min-h-screen w-full flex items-start justify-center p-6 sm:p-10">
      <OrderbookWidget />
      <LagRadar />
    </main>
  );
}
