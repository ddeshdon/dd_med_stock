"use client";

import { useEffect, useState } from "react";
import { Settings } from "@/lib/types";
import { Card } from "@/components/Card";

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    async function load() {
      const res = await fetch("/api/settings");
      setSettings(await res.json());
      setLoading(false);
    }
    load();
  }, []);

  async function save() {
    if (!settings) return;
    setSaving(true);
    setSaved(false);
    const res = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
    setSettings(await res.json());
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  if (loading || !settings) {
    return <p className="text-sm text-slate-400">Loading...</p>;
  }

  return (
    <div className="space-y-4 max-w-lg">
      <div>
        <h1 className="text-xl font-semibold text-slate-800">Settings</h1>
        <p className="text-sm text-slate-500">
          Set the default cut that gets deducted from each sale before you get paid. This
          auto-fills every new sale, but you can still change it per sale if needed.
        </p>
      </div>

      <Card>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-slate-500">Label (who takes the cut)</label>
            <input
              className="mt-1 w-full border border-slate-200 rounded-md px-3 py-2 text-sm"
              value={settings.owner_label}
              onChange={(e) => setSettings({ ...settings, owner_label: e.target.value })}
              placeholder="e.g. Owner's Cut / Non's Mom's Cut"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-500">Deduction Type</label>
              <select
                className="mt-1 w-full border border-slate-200 rounded-md px-3 py-2 text-sm"
                value={settings.default_deduction_type}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    default_deduction_type: e.target.value as "percent" | "fixed",
                  })
                }
              >
                <option value="percent">Percent (%)</option>
                <option value="fixed">Fixed Amount (฿)</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500">
                Default Value {settings.default_deduction_type === "percent" ? "(%)" : "(฿)"}
              </label>
              <input
                type="number"
                className="mt-1 w-full border border-slate-200 rounded-md px-3 py-2 text-sm"
                value={settings.default_deduction_value}
                onChange={(e) =>
                  setSettings({ ...settings, default_deduction_value: Number(e.target.value) })
                }
              />
            </div>
          </div>
          <p className="text-xs text-slate-400">
            Example: if set to 30%, a ฿1,000 client payment automatically shows ฿300 going to the
            owner and ฿700 as your price before drug/consumable costs.
          </p>
          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={save}
              disabled={saving}
              className="px-4 py-2 text-sm rounded-md bg-rose-500 hover:bg-rose-600 text-white font-medium disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save Settings"}
            </button>
            {saved && <span className="text-xs text-emerald-600 font-medium">Saved ✓</span>}
          </div>
        </div>
      </Card>
    </div>
  );
}
