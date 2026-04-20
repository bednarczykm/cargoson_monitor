"use client";

import { useState, useEffect } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import { format } from "date-fns";
import { pl } from "date-fns/locale";

interface AlertsChartProps {
  data: Array<{ date: string; count: number }>;
}

export default function AlertsChart({ data }: AlertsChartProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div className="h-64 bg-slate-100 animate-pulse rounded-lg" />;
  }

  if (!data || data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-slate-400">
        Brak danych do wyświetlenia
      </div>
    );
  }

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <defs>
            <linearGradient id="alertGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#60B5FF" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#60B5FF" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="date"
            tickLine={false}
            tick={{ fontSize: 10 }}
            tickFormatter={(val) => {
              const d = new Date(val);
              return `${d.getDate()}.${d.getMonth() + 1}`;
            }}
          />
          <YAxis
            tickLine={false}
            tick={{ fontSize: 10 }}
            allowDecimals={false}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "white",
              border: "1px solid #e2e8f0",
              borderRadius: "8px",
              fontSize: "11px",
            }}
            labelFormatter={(val) => format(new Date(val), "dd.MM.yyyy", { locale: pl })}
            formatter={(value: number) => [value, "Alerty"]}
          />
          <Area
            type="monotone"
            dataKey="count"
            stroke="#60B5FF"
            strokeWidth={2}
            fill="url(#alertGradient)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
