import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

export default function ConvBar({ data }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#E6E1D6" />
        <XAxis dataKey="name" tick={{ fontSize: 12, fill: "#0E1116" }} />
        <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: "#0E1116" }} />
        <Tooltip />
        <Bar dataKey="value" fill="#FF8A1E" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}