import { Users, Flame, Clock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

type Metrics = {
  total: number;
  highIntent: number;
  pending: number;
};

export function MetricCards({ metrics }: { metrics: Metrics }) {
  const cards = [
    {
      label: "Total Leads",
      value: metrics.total,
      icon: Users,
      accent: "text-primary",
    },
    {
      label: "High Intent (Score ≥ 8)",
      value: metrics.highIntent,
      icon: Flame,
      accent: "text-emerald-600",
    },
    {
      label: "Pending Actions",
      value: metrics.pending,
      icon: Clock,
      accent: "text-amber-600",
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <Card key={card.label}>
            <CardContent className="flex items-center gap-4 p-5">
              <Icon className={`size-8 shrink-0 ${card.accent}`} aria-hidden="true" />
              <div>
                <p className="text-sm text-muted-foreground">{card.label}</p>
                <p className="text-3xl font-semibold text-foreground">
                  {card.value}
                </p>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
