"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { PatientSummary } from "@/lib/types";
import { formatCurrency } from "@/lib/format";
import { Card } from "@/components/Card";

type SortKey = "name" | "visits" | "recent";

export default function PatientsPage() {
  const [patients, setPatients] = useState<PatientSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("name");
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const res = await fetch("/api/patients");
      setPatients(await res.json());
      setLoading(false);
    }
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = q ? patients.filter((p) => p.name.toLowerCase().includes(q)) : patients;
    list = [...list];
    if (sort === "name") {
      list.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sort === "visits") {
      list.sort((a, b) => b.total_visits - a.total_visits);
    } else if (sort === "recent") {
      list.sort((a, b) => (a.last_visit < b.last_visit ? 1 : -1));
    }
    return list;
  }, [patients, search, sort]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-800">Patients</h1>
        <p className="text-sm text-slate-500">
          Search and review each patient&apos;s visit history, counted separately per treatment.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          className="flex-1 min-w-[200px] border border-slate-200 rounded-md px-3 py-2 text-sm"
          placeholder="Search patient name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="flex gap-2 text-sm">
          {(
            [
              ["name", "Name (A-Z)"],
              ["visits", "Most Visits"],
              ["recent", "Most Recent"],
            ] as [SortKey, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setSort(key)}
              className={`px-3 py-1.5 rounded-md font-medium ${
                sort === key ? "bg-slate-800 text-white" : "bg-white border border-slate-200 text-slate-600"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <Card>
        {loading ? (
          <p className="text-sm text-slate-400">Loading...</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-slate-400">
            {patients.length === 0
              ? "No patients yet — add a patient name when logging a sale."
              : "No patients match your search."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-400 text-xs uppercase">
                  <th className="py-2 pr-4">Name</th>
                  <th className="py-2 pr-4">Total Visits</th>
                  <th className="py-2 pr-4">Services</th>
                  <th className="py-2 pr-4">Last Visit</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <Fragment key={p.name}>
                    <tr
                      className="border-t border-slate-100 cursor-pointer hover:bg-slate-50"
                      onClick={() => setExpanded(expanded === p.name ? null : p.name)}
                    >
                      <td className="py-2 pr-4 font-medium text-slate-700">{p.name}</td>
                      <td className="py-2 pr-4">{p.total_visits}</td>
                      <td className="py-2 pr-4">
                        <div className="flex flex-wrap gap-1">
                          {p.services.map((s) => (
                            <span
                              key={s.service_name}
                              className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full"
                            >
                              {s.service_name} ×{s.count}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="py-2 pr-4 text-slate-500">{p.last_visit}</td>
                    </tr>
                    {expanded === p.name && (
                      <tr className="bg-slate-50">
                        <td colSpan={4} className="px-4 py-3">
                          <p className="text-xs font-medium text-slate-500 mb-2">Visit history:</p>
                          <ul className="text-xs text-slate-600 space-y-1">
                            {p.visits.map((v) => (
                              <li key={v.id} className="flex items-center justify-between">
                                <span>
                                  {v.date} &mdash; {v.service_name}{" "}
                                  <span className="text-slate-400">(visit #{v.visit_number})</span>
                                </span>
                                <span>
                                  {formatCurrency(v.gross_price)} paid, earned{" "}
                                  {formatCurrency(v.profit)}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
