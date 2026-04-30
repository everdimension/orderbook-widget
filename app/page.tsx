import { OrderbookWidget } from "@/components/OrderbookWidget";
import { LagRadar } from "@/components/LagRadar";

export default function Page() {
  return (
    <main className="min-h-screen w-full p-6 sm:p-10">
      <div className="flex flex-col items-start gap-4 w-[420px] max-w-full mx-auto">
        <OrderbookWidget />
        <LagRadar />
      </div>
    </main>
  );
}
