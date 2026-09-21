import { type FormEvent, type ReactNode, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Anchor,
  ArrowDownToLine,
  ArrowUpRight,
  CheckCircle2,
  CircleAlert,
  Clock3,
  Container,
  RefreshCw,
  Search,
  ShipWheel,
  Waves,
  X,
} from 'lucide-react';
import { Link, useLocation } from 'wouter';
import {
  getGetScheduleSummaryQueryKey,
  getGetSchedulesQueryKey,
  useGetScheduleSummary,
  useGetSchedules,
  useRefreshSchedules,
} from '@workspace/api-client-react';

type Filters = {
  destinations?: string[];
  departureFrom?: string;
  departureTo?: string;
};

type FilterOption = {
  value: string;
  kind: 'Port' | 'Country';
};

const formatCount = (value: number | undefined) => new Intl.NumberFormat('en-US').format(value ?? 0);

const formatDate = (value: string | null | undefined) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short' }).format(date);
};

const formatUpdated = (value: string | null | undefined) => {
  if (!value) return 'not available';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

function MetricCard({
  label,
  value,
  detail,
  icon,
  tone = 'teal',
  testId,
}: {
  label: string;
  value: string;
  detail: string;
  icon: ReactNode;
  tone?: 'teal' | 'amber' | 'ink';
  testId: string;
}) {
  return (
    <article data-testid={testId} className="group relative overflow-hidden rounded-2xl border border-border/70 bg-card/90 p-5 shadow-[0_8px_24px_hsl(202_50%_17%/0.04)] transition-transform duration-200 hover:-translate-y-0.5">
      <div className={`absolute right-0 top-0 h-24 w-24 translate-x-8 -translate-y-8 rounded-full ${tone === 'amber' ? 'bg-accent/15' : tone === 'ink' ? 'bg-sidebar/10' : 'bg-primary/10'}`} />
      <div className="relative flex items-start justify-between">
        <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${tone === 'amber' ? 'bg-accent/20 text-amber-800' : tone === 'ink' ? 'bg-sidebar/10 text-sidebar' : 'bg-primary/12 text-primary'}`}>
          {icon}
        </span>
        <ArrowUpRight className="h-4 w-4 text-muted-foreground/50 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
      </div>
      <p className="relative mt-5 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <p data-testid={`${testId}-value`} className="relative mt-1 font-mono text-2xl font-medium tracking-tight text-foreground">{value}</p>
      <p className="relative mt-1 text-xs text-muted-foreground">{detail}</p>
    </article>
  );
}

function SearchPage() {
  const [, setLocation] = useLocation();
  const [draft, setDraft] = useState<Filters>({});
  const [destinationInput, setDestinationInput] = useState('');
  const [refreshMessage, setRefreshMessage] = useState('');
  const queryClient = useQueryClient();
  const filterOptionsQuery = useGetSchedules({});
  const summaryQuery = useGetScheduleSummary();
  const refreshMutation = useRefreshSchedules();

  const filterOptions = useMemo(() => {
    const options = new Map<string, FilterOption>();
    const addOption = (value: string | null | undefined, kind: FilterOption['kind']) => {
      const trimmed = value?.trim();
      if (!trimmed) return;
      const key = trimmed.toLowerCase();
      if (!options.has(key)) options.set(key, { value: trimmed, kind });
    };

    for (const schedule of filterOptionsQuery.data?.schedules ?? []) {
      addOption(schedule.destination, 'Port');
      addOption(schedule.destinationCountry, 'Country');
    }
    return [...options.values()].sort((left, right) => left.value.localeCompare(right.value));
  }, [filterOptionsQuery.data?.schedules]);

  const destinationSuggestions = useMemo(() => {
    const query = destinationInput.trim().toLowerCase();
    if (!query) return [];
    const selected = new Set((draft.destinations ?? []).map((destination) => destination.toLowerCase()));
    return filterOptions
      .filter((option) => option.value.toLowerCase().includes(query) && !selected.has(option.value.toLowerCase()))
      .slice(0, 8);
  }, [destinationInput, draft.destinations, filterOptions]);

  const stale = Boolean(summaryQuery.data?.isStale);
  const isInitialLoading = summaryQuery.isLoading;
  const showDestinationSuggestions = destinationInput.trim().length > 0 && destinationSuggestions.length > 0;

  const clearSearch = () => {
    setDraft({});
    setDestinationInput('');
  };

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const query = new URLSearchParams();
    if (draft.destinations?.length) query.set('destination', draft.destinations.join(','));
    if (draft.departureFrom) query.set('departureFrom', draft.departureFrom);
    if (draft.departureTo) query.set('departureTo', draft.departureTo);
    const queryString = query.toString();
    setLocation(`/manifest${queryString ? `?${queryString}` : ''}`);
  };

  const addDestination = (rawValue = destinationInput) => {
    const value = rawValue.trim();
    if (!value) return;
    const destinations = draft.destinations ?? [];
    if (destinations.some((destination) => destination.toLowerCase() === value.toLowerCase())) {
      setDestinationInput('');
      return;
    }
    setDraft({ ...draft, destinations: [...destinations, value] });
    setDestinationInput('');
  };

  const removeDestination = (value: string) => {
    setDraft({
      ...draft,
      destinations: (draft.destinations ?? []).filter((destination) => destination !== value),
    });
  };

  const refresh = () => {
    setRefreshMessage('');
    refreshMutation.mutate(undefined, {
      onSuccess: (response) => {
        queryClient.invalidateQueries({ queryKey: getGetSchedulesQueryKey({}) });
        queryClient.invalidateQueries({ queryKey: getGetScheduleSummaryQueryKey() });
        setRefreshMessage(`${formatCount(response.count)} sailings synced just now`);
      },
      onError: () => setRefreshMessage('Sync could not be completed. Try again in a moment.'),
    });
  };

  return (
    <div className="desk-shell min-h-[100dvh] text-foreground">
      <aside className="nav-grid fixed inset-y-0 left-0 z-20 hidden w-[250px] flex-col bg-sidebar text-sidebar-foreground md:flex">
        <div className="border-b border-sidebar-border/70 px-7 py-7">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground">
              <ShipWheel className="h-5 w-5" />
            </span>
            <div>
              <p className="font-semibold leading-tight tracking-tight">Port Louis</p>
              <p className="eyebrow mt-1 text-sidebar-foreground/55">Sailing desk</p>
            </div>
          </div>
        </div>
        <div className="flex-1 px-4 py-7">
          <p className="eyebrow px-3 text-sidebar-foreground/40">Operations</p>
          <Link href="/" className="mt-3 flex items-center gap-3 rounded-xl border border-sidebar-primary/30 bg-sidebar-primary/10 px-3 py-3 text-sm font-semibold text-sidebar-primary-foreground">
            <Search className="h-4 w-4 text-sidebar-primary" />
            Search schedules
          </Link>
          <Link href="/manifest" className="mt-1 flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold text-sidebar-foreground/70 transition-colors hover:bg-sidebar-primary/10 hover:text-sidebar-primary-foreground">
            <Anchor className="h-4 w-4 text-sidebar-primary" />
            Departure manifest
          </Link>
        </div>
        <div className="border-t border-sidebar-border/70 px-7 py-6">
          <p className="eyebrow text-sidebar-foreground/40">Data source</p>
          <div className="mt-3 flex items-center gap-2 text-xs text-sidebar-foreground/75">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            MSC + Maersk schedule interfaces
          </div>
          <p data-testid="text-sidebar-origin" className="mt-2 text-xs text-sidebar-foreground/45">Origin locked to Port Louis, MU</p>
        </div>
      </aside>

      <main className="md:pl-[250px]">
        <header className="border-b border-border/65 bg-background/85 px-5 py-5 backdrop-blur-md md:px-10 md:py-7">
          <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4">
            <div className="flex items-center gap-3 md:hidden">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-sidebar text-sidebar-primary"><ShipWheel className="h-4 w-4" /></span>
              <span className="font-semibold">Port Louis Sailing Desk</span>
            </div>
            <div className="hidden md:block">
              <p className="eyebrow text-primary">Operations / Schedule intelligence</p>
              <h1 className="mt-2 text-2xl font-bold tracking-[-0.04em] text-foreground md:text-[2rem]">Find a sailing</h1>
            </div>
            <div className="flex items-center gap-2">
              <span data-testid="status-live" className="hidden items-center gap-2 rounded-full border border-border bg-card px-3 py-2 text-xs font-semibold text-muted-foreground sm:flex">
                <span className={`h-2 w-2 rounded-full ${stale ? 'bg-accent' : 'bg-emerald-500'}`} />
                {stale ? 'Cached view' : 'Live cache'}
              </span>
              <button data-testid="button-refresh-schedules" type="button" onClick={refresh} disabled={refreshMutation.isPending} className="inline-flex items-center gap-2 rounded-xl bg-primary px-3.5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-primary/90 disabled:cursor-wait disabled:opacity-60">
                <RefreshCw className={`h-4 w-4 ${refreshMutation.isPending ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">{refreshMutation.isPending ? 'Syncing' : 'Refresh data'}</span>
              </button>
            </div>
          </div>
        </header>

        <div className="mx-auto max-w-[1440px] px-5 py-7 md:px-10 md:py-10">
          <div className="mb-7 md:hidden">
            <p className="eyebrow text-primary">Operations / Schedule intelligence</p>
            <h1 className="mt-2 text-2xl font-bold tracking-[-0.04em]">Find a sailing</h1>
          </div>

          {stale && (
            <div data-testid="status-stale-data" className="mb-6 flex items-start gap-3 rounded-xl border border-accent/40 bg-accent/10 px-4 py-3 text-sm text-amber-950">
              <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
              <p><strong>Using the last successful capture.</strong> The schedule source is currently marked stale; refresh when you need to check for a new carrier response.</p>
            </div>
          )}

          <section aria-label="Schedule summary" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard testId="metric-sailings" label="Sailings in view" value={isInitialLoading ? '—' : formatCount(summaryQuery.data?.count)} detail="Current cached departures" icon={<Waves className="h-4 w-4" />} />
            <MetricCard testId="metric-destinations" label="Destinations" value={isInitialLoading ? '—' : formatCount(summaryQuery.data?.destinationCount)} detail="Unique ports ahead" icon={<ArrowDownToLine className="h-4 w-4" />} tone="amber" />
            <MetricCard testId="metric-vessels" label="Vessels" value={isInitialLoading ? '—' : formatCount(summaryQuery.data?.vesselCount)} detail="Ships on the board" icon={<Container className="h-4 w-4" />} tone="ink" />
            <MetricCard testId="metric-next-departure" label="Next departure" value={isInitialLoading ? '—' : formatDate(summaryQuery.data?.nextDeparture)} detail={summaryQuery.data?.nextDeparture ? 'Earliest scheduled sailing' : 'No date currently available'} icon={<Clock3 className="h-4 w-4" />} />
          </section>

          <section className="mt-9 rounded-2xl border border-border/80 bg-card p-5 shadow-[0_12px_30px_hsl(202_50%_17%/0.05)] md:p-8">
            <div className="max-w-2xl">
              <p className="eyebrow text-primary">Schedule search</p>
              <h2 className="mt-2 text-2xl font-bold tracking-[-0.04em]">Find the next departure that fits</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Search MSC and Maersk sailings from Port Louis by destination or departure window, then open the full departure manifest.</p>
            </div>

            <form data-testid="form-schedule-search" onSubmit={submitSearch} className="mt-7 grid gap-4 rounded-2xl border border-primary/20 bg-primary/[0.035] p-4 md:grid-cols-[1.3fr_1fr_1fr_auto] md:items-end md:p-5">
              <label className="relative block">
                <span className="eyebrow text-muted-foreground">Ports or countries</span>
                <div className="mt-2 flex min-h-10 flex-wrap items-center gap-1.5 rounded-lg border border-input bg-card px-2 py-1.5 transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15">
                  <Search className="ml-1 h-4 w-4 shrink-0 text-muted-foreground" />
                  {(draft.destinations ?? []).map((destination) => (
                    <span key={destination} className="inline-flex items-center gap-1 rounded-md bg-primary/10 py-1 pl-2 pr-1 text-xs font-semibold text-primary">
                      {destination}
                      <button data-testid={`button-remove-destination-${destination}`} type="button" onClick={() => removeDestination(destination)} aria-label={`Remove ${destination}`} className="rounded p-0.5 transition-colors hover:bg-primary/15">
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                  <input
                    data-testid="input-destination"
                    value={destinationInput}
                    onChange={(event) => setDestinationInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        addDestination();
                      }
                    }}
                    placeholder={(draft.destinations ?? []).length ? 'Add another' : 'Search a port or country'}
                    aria-describedby="destination-search-help"
                    className="h-7 min-w-[10rem] flex-1 border-0 bg-transparent px-1 text-sm outline-none placeholder:text-muted-foreground/70"
                  />
                  <button data-testid="button-add-destination" type="button" onClick={() => addDestination()} disabled={!destinationInput.trim()} className="rounded-md bg-sidebar px-2.5 py-1.5 text-xs font-bold text-sidebar-foreground transition-colors hover:bg-sidebar/90 disabled:cursor-not-allowed disabled:opacity-40">
                    Add
                  </button>
                </div>
                {showDestinationSuggestions && (
                  <div data-testid="destination-suggestions" className="absolute left-0 right-0 top-full z-10 mt-1 overflow-hidden rounded-lg border border-border bg-card p-1 shadow-lg">
                    {destinationSuggestions.map((option) => (
                      <button key={`${option.kind}-${option.value}`} data-testid={`suggestion-destination-${option.value}`} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => addDestination(option.value)} className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-secondary">
                        <span>{option.value}</span>
                        <span className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">{option.kind}</span>
                      </button>
                    ))}
                  </div>
                )}
                <p id="destination-search-help" className="mt-1 text-[0.68rem] text-muted-foreground">Type a port or country, then click Add. Select × to remove it.</p>
              </label>
              <label className="block">
                <span className="eyebrow text-muted-foreground">Departing from</span>
                <input data-testid="input-departure-from" type="date" value={draft.departureFrom ?? ''} onChange={(event) => setDraft({ ...draft, departureFrom: event.target.value })} className="mt-2 h-10 w-full rounded-lg border border-input bg-card px-3 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/15" />
              </label>
              <label className="block">
                <span className="eyebrow text-muted-foreground">Departing to</span>
                <input data-testid="input-departure-to" type="date" value={draft.departureTo ?? ''} onChange={(event) => setDraft({ ...draft, departureTo: event.target.value })} className="mt-2 h-10 w-full rounded-lg border border-input bg-card px-3 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/15" />
              </label>
              <div className="flex items-center gap-2">
                <button data-testid="button-clear-search" type="button" onClick={clearSearch} className="h-10 rounded-lg border border-border bg-card px-3 text-sm font-semibold text-muted-foreground transition-colors hover:bg-secondary">Clear</button>
                <button data-testid="button-search-schedules" type="submit" className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-sidebar px-4 text-sm font-bold text-sidebar-foreground transition-colors hover:bg-sidebar/90">
                  <Search className="h-4 w-4" /> Search
                </button>
              </div>
            </form>

            <div className="mt-5 flex flex-col gap-3 border-t border-border/60 pt-5 text-sm sm:flex-row sm:items-center sm:justify-between">
              <span className="text-muted-foreground">The manifest keeps the complete sailing list and your selected search window.</span>
              <Link href="/manifest" className="inline-flex items-center justify-center rounded-lg border border-primary/30 bg-primary/[0.06] px-3 py-2 font-bold text-primary transition-colors hover:border-primary/50 hover:bg-primary/12">Browse all departures</Link>
            </div>
          </section>

          {refreshMessage && <div data-testid="status-refresh-feedback" className={`mt-5 flex items-center gap-2 text-sm ${refreshMessage.includes('could not') ? 'text-destructive' : 'text-emerald-700'}`}><CheckCircle2 className="h-4 w-4" />{refreshMessage}</div>}

          <footer className="mt-7 flex flex-col gap-2 border-t border-border/60 pt-5 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <span data-testid="text-last-updated">Last captured {formatUpdated(summaryQuery.data?.lastUpdated)}</span>
            <span data-testid="text-source" className="inline-flex items-center gap-1.5">MSC + Maersk schedule interfaces</span>
          </footer>
        </div>
      </main>
    </div>
  );
}

export default SearchPage;