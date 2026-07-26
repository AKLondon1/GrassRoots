"use client";

import { CheckCircle2, FileSpreadsheet, MailWarning, ShieldCheck } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Status } from "@/components/ui/status";
import { applyPeopleImport, type PeopleImportPreview } from "@/features/people/import/service";
import { DemoRepository } from "@/lib/demo/repository";
import { createRiversideDemoSeed, riversideDemoIds } from "@/lib/demo/seed";

const exampleCsv = `player_first_name,player_last_name,date_of_birth,team,guardian_name,guardian_email,relationship,communication,payments,consent
Amelia,Reed,2019-02-14,Under 7s,Casey Reed,casey.reed@example.test,Parent,true,true,true`;

export function PeopleSetup() {
  const [repository] = useState(
    () => new DemoRepository(createRiversideDemoSeed()),
  );
  const setup = repository.getClubSetup(riversideDemoIds.organisation);
  const [csv, setCsv] = useState(exampleCsv);
  const [preview, setPreview] = useState<PeopleImportPreview | null>(null);
  const [appliedCount, setAppliedCount] = useState<number | null>(null);

  function previewImport() {
    setPreview(repository.previewPeopleImport(riversideDemoIds.organisation, csv));
    setAppliedCount(null);
  }

  function applyImport() {
    if (!preview) return;
    const result = applyPeopleImport(preview, repository);
    setAppliedCount(result.appliedCount);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(17rem,0.6fr)]">
      <div className="space-y-6">
        <section className="rounded-2xl border border-border-strong bg-background p-5 sm:p-7" aria-labelledby="club-setup-title">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 id="club-setup-title" className="text-xl font-semibold tracking-[-0.025em] text-ink">
                Club setup
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
                Fictional setup records held only in this demo repository.
              </p>
            </div>
            <Status tone="success">Ready to review</Status>
          </div>

          <dl className="mt-6 divide-y divide-border border-y border-border">
            <div className="grid gap-1 py-4 sm:grid-cols-[9rem_1fr] sm:gap-4">
              <dt className="text-sm font-semibold text-muted">Club</dt>
              <dd className="text-sm font-semibold text-ink">{setup.organisation.name}</dd>
            </div>
            <div className="grid gap-1 py-4 sm:grid-cols-[9rem_1fr] sm:gap-4">
              <dt className="text-sm font-semibold text-muted">Active season</dt>
              <dd className="text-sm text-ink">{setup.activeSeason.name}</dd>
            </div>
            <div className="grid gap-1 py-4 sm:grid-cols-[9rem_1fr] sm:gap-4">
              <dt className="text-sm font-semibold text-muted">Teams</dt>
              <dd className="flex flex-wrap gap-2 text-sm text-ink">
                {setup.teams.map((team) => (
                  <span key={team.id} className="rounded-lg bg-surface-strong px-2.5 py-1 font-medium">
                    {team.name}
                  </span>
                ))}
              </dd>
            </div>
          </dl>

          <div className="mt-5 flex items-start gap-3 rounded-xl bg-warning-soft p-4 text-warning-strong">
            <MailWarning className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold">Manager invitation prepared</p>
              <p className="mt-1 text-sm leading-6">
                {setup.managerInvitation.email} · no email has been sent. Delivery is disabled in demo mode.
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-border-strong bg-background p-5 sm:p-7" aria-labelledby="csv-import-title">
          <div className="flex items-start gap-3">
            <FileSpreadsheet className="mt-0.5 size-5 shrink-0 text-primary-strong" aria-hidden="true" />
            <div>
              <h2 id="csv-import-title" className="text-xl font-semibold tracking-[-0.025em] text-ink">
                People CSV import
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
                Preview validates every row and checks duplicates. Previewing never adds people.
              </p>
            </div>
          </div>

          <label htmlFor="people-csv" className="mt-6 block text-sm font-semibold text-ink">
            CSV data
          </label>
          <textarea
            id="people-csv"
            value={csv}
            onChange={(event) => setCsv(event.target.value)}
            rows={6}
            spellCheck={false}
            className="mt-2 w-full resize-y rounded-xl border border-border-strong bg-surface px-4 py-3 font-mono text-xs leading-5 text-ink outline-none transition-colors duration-200 focus:border-primary-strong focus:ring-3 focus:ring-ring/25"
          />
          <div className="mt-4 flex flex-wrap gap-3">
            <Button type="button" onClick={previewImport}>Preview import</Button>
          </div>

          {preview ? (
            <div className="mt-7 border-t border-border pt-6" aria-live="polite">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-ink">Import preview</h2>
                <Status tone={preview.summary.invalid > 0 ? "danger" : "success"}>
                  {preview.summary.ready} {preview.summary.ready === 1 ? "row" : "rows"} ready
                </Status>
              </div>
              <p className="mt-3 text-sm leading-6 text-muted">
                {preview.summary.invalid > 0
                  ? `${preview.summary.invalid} row requires attention. Nothing has been added yet.`
                  : "Nothing has been added yet. Apply the checked rows when you are ready."}
              </p>

              {preview.rows.map((row) => (
                <div key={row.rowNumber} className="mt-4 rounded-xl bg-surface-strong p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-ink">Row {row.rowNumber}</p>
                    <Status tone={row.status === "ready" ? "success" : row.status === "duplicate" ? "warning" : "danger"}>
                      {row.status}
                    </Status>
                  </div>
                  {row.value ? (
                    <p className="mt-2 text-sm text-muted">
                      {row.value.player_first_name} {row.value.player_last_name} · {row.value.team}
                    </p>
                  ) : (
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-danger-strong">
                      {row.errors.map((error) => (
                        <li key={`${error.field}-${error.message}`}>{error.message}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}

              <div className="mt-5 flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  onClick={applyImport}
                  disabled={preview.summary.ready === 0 || preview.summary.invalid > 0 || appliedCount !== null}
                >
                  Apply {preview.summary.ready} {preview.summary.ready === 1 ? "row" : "rows"}
                </Button>
                {appliedCount !== null ? (
                  <p className="inline-flex items-center gap-2 text-sm font-semibold text-success-strong" role="status">
                    <CheckCircle2 className="size-4" aria-hidden="true" />
                    {appliedCount} {appliedCount === 1 ? "person" : "people"} added to this demo
                  </p>
                ) : null}
              </div>
              {appliedCount !== null ? (
                <p className="mt-3 text-sm leading-6 text-muted">
                  This local change is not saved to Supabase and will reset when the page reloads.
                </p>
              ) : null}
            </div>
          ) : null}
        </section>
      </div>

      <aside className="h-fit rounded-2xl bg-surface-strong p-5 sm:p-6" aria-labelledby="privacy-boundary-title">
        <ShieldCheck className="size-5 text-primary-strong" aria-hidden="true" />
        <h2 id="privacy-boundary-title" className="mt-4 text-lg font-semibold text-ink">
          People boundary
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted">
          Children are player records, never sign-in accounts. Guardian permissions are stored per child and household.
        </p>
        <ul className="mt-5 space-y-3 border-t border-border-strong pt-5 text-sm leading-6 text-muted">
          <li>Restricted contacts are not disclosed in household summaries.</li>
          <li>Each row stays inside Riverside Juniors.</li>
          <li>Medical information is not part of this import.</li>
        </ul>
      </aside>
    </div>
  );
}
