"use client";
import { useState } from "react";
import type { Point } from "@/lib/stats";

function smooth(pts: [number, number][]) {
  if (pts.length < 2) return "";
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] ?? p2;
    d += ` C${p1[0] + (p2[0] - p0[0]) / 6},${p1[1] + (p2[1] - p0[1]) / 6} ${p2[0] - (p3[0] - p1[0]) / 6},${p2[1] - (p3[1] - p1[1]) / 6} ${p2[0]},${p2[1]}`;
  }
  return d;
}

export function MovementChart({ data }: { data: Point[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 640, H = 260, L = 42, R = 16, T = 14, B = 30;
  const max = Math.max(10, ...data.flatMap((d) => [d.in, d.out]));
  const step = Math.ceil(max / 4 / 10) * 10, top = step * 4;
  const x = (i: number) => L + (data.length === 1 ? 0 : (i * (W - L - R)) / (data.length - 1));
  const y = (v: number) => T + (H - T - B) * (1 - v / top);
  const inPts = data.map((d, i) => [x(i), y(d.in)] as [number, number]);
  const outPts = data.map((d, i) => [x(i), y(d.out)] as [number, number]);
  const area = (pts: [number, number][]) => `${smooth(pts)} L${x(data.length - 1)},${y(0)} L${x(0)},${y(0)} Z`;
  const every = Math.ceil(data.length / 8);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" onMouseLeave={() => setHover(null)}>
      <defs>
        <linearGradient id="gIn" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#10b981" stopOpacity=".35" /><stop offset="1" stopColor="#10b981" stopOpacity="0" /></linearGradient>
        <linearGradient id="gOut" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#3b82f6" stopOpacity=".3" /><stop offset="1" stopColor="#3b82f6" stopOpacity="0" /></linearGradient>
      </defs>
      {[0, 1, 2, 3, 4].map((i) => (
        <g key={i}>
          <line x1={L} x2={W - R} y1={y(step * i)} y2={y(step * i)} stroke="#c7d6f0" strokeDasharray="4 5" opacity=".7" />
          <text x={L - 8} y={y(step * i) + 4} textAnchor="end" fontSize="11" fill="#64748b">{step * i}</text>
        </g>
      ))}
      <path d={area(inPts)} fill="url(#gIn)" />
      <path d={area(outPts)} fill="url(#gOut)" />
      <path d={smooth(inPts)} fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" />
      <path d={smooth(outPts)} fill="none" stroke="#3b82f6" strokeWidth="2.5" strokeLinecap="round" />
      {data.map((d, i) => (
        <g key={i}>
          {i % every === 0 && <text x={x(i)} y={H - 8} textAnchor="middle" fontSize="11" fill="#64748b">{d.label}</text>}
          <rect x={x(i) - 12} y={T} width="24" height={H - T - B} fill="transparent" onMouseEnter={() => setHover(i)} />
        </g>
      ))}
      {hover !== null && (
        <g>
          <line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} stroke="#94a3b8" strokeDasharray="3 3" />
          <circle cx={x(hover)} cy={y(data[hover].in)} r="5" fill="#10b981" stroke="#fff" strokeWidth="2" />
          <circle cx={x(hover)} cy={y(data[hover].out)} r="5" fill="#3b82f6" stroke="#fff" strokeWidth="2" />
          <g transform={`translate(${Math.min(x(hover) + 10, W - 130)},${T + 4})`}>
            <rect width="120" height="52" rx="10" fill="#fff" opacity=".92" stroke="#dbe5f7" />
            <text x="10" y="18" fontSize="11" fontWeight="600" fill="#1e2a4a">{data[hover].label}</text>
            <text x="10" y="33" fontSize="11" fill="#10b981">In: {data[hover].in}</text>
            <text x="10" y="46" fontSize="11" fill="#3b82f6">Out: {data[hover].out}</text>
          </g>
        </g>
      )}
    </svg>
  );
}

export const ChartLegend = () => (
  <div className="mb-2 flex gap-4 text-xs text-slate-600">
    <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-emerald-500" />Stock In</span>
    <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-blue-500" />Stock Out</span>
  </div>
);