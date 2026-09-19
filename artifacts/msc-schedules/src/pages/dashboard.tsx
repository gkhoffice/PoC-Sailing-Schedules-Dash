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
  Database,
  ExternalLink,
  Filter,
  RefreshCw,
  Search,
  ShipWheel,
  SlidersHorizontal,
  Waves,
  X,
} from 'lucide-react';
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

const formatDate = (value: string | null | undefined, compact = false) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-GB', compact
    ? { day: '2-digit', month: 'short' }
    : { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
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

const formatCount = (value: number | undefined) => new Intl.NumberFormat('en-US').format(value ?? 0);
const MSC_BOOKING_URL = 'https://www.msc.com/en/lp/book-with-mymsc';

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

function ScheduleSkeleton() {
  return (
    <div data-testid="loading-schedules" className="space-y-3">
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={index} className="grid grid-cols-[1.3fr_1fr_0.8fr_0.8fr_0.65fr] gap-4 rounded-xl border border-border/50 bg-card p-4">
          {Array.from({ length: 5 }).map((__, cell) => <div key={cell} className="skeleton h-5 rounded-md" />)}
        </div>
      ))}
    </div>
  );
}

function Dashboard() {
  const [draft, setDraft] = useState<Filters>({});
  const [filters, setFilters] = useState<Filters>({});
  const [destinationInput, setDestinationInput] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [refreshMessage, setRefreshMessage] = useState('');
  const queryClient = useQueryClient();

  const params = useMemo(() => ({
    ...(filters.destinations?.length ? { destination: filters.destinations.join(',') } : {}),
    ...(filters.departureFrom ? { departureFrom: filters.departureFrom } : {}),
    ...(filters.departureTo ? { departureTo: filters.departureTo } : {}),
  }), [filters]);

  const schedulesQuery = useGetSchedules(params);
  const filterOptionsQuery = useGetSchedules({});
  const summaryQuery = useGetScheduleSummary();
  const refreshMutation = useRefreshSchedules();
  const schedules = schedulesQuery.data?.schedules ?? [];
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
  const showDestinationSuggestions = destinationInput.trim().length > 0 && destinationSuggestions.length > 0;
  const activeFilterCount = [
    Boolean(filters.destinations?.length),
    Boolean(filters.departureFrom),
    Boolean(filters.departureTo),
  ].filter(Boolean).length;
  const hasFilters = activeFilterCount > 0;
  const isInitialLoading = schedulesQuery.isLoading || summaryQuery.isLoading;
  const isError = schedulesQuery.isError || summaryQuery.isError;
  const stale = Boolean(schedulesQuery.data?.isStale || summaryQuery.data?.isStale);

  const clearFilters = () => {
    setDraft({});
    setDestinationInput('');
    setFilters({});
  };

  const submitFilters = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFilters(draft);
    setShowFilters(false);
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
        queryClient.invalidateQueries({ queryKey: getGetSchedulesQueryKey(params) });
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
          <div className="mt-3 rounded-xl border border-sidebar-primary/30 bg-sidebar-primary/10 px-3 py-3 text-sm font-semibold text-sidebar-primary-foreground">
            <div className="flex items-center gap-3">
              <Anchor className="h-4 w-4 text-sidebar-primary" />
              Current sailings
            </div>
            <p className="mt-2 pl-7 text-xs font-normal leading-relaxed text-sidebar-foreground/55">MSC departures from Mauritius</p>
          </div>
        </div>
        <div className="border-t border-sidebar-border/70 px-7 py-6">
          <p className="eyebrow text-sidebar-foreground/40">Data source</p>
          <div className="mt-3 flex items-center gap-2 text-xs text-sidebar-foreground/75">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            MSC schedule interface
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
              <h1 className="mt-2 text-2xl font-bold tracking-[-0.04em] text-foreground md:text-[2rem]">Today’s departure board</h1>
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
            <h1 className="mt-2 text-2xl font-bold tracking-[-0.04em]">Today’s departure board</h1>
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
            <MetricCard testId="metric-next-departure" label="Next departure" value={isInitialLoading ? '—' : formatDate(summaryQuery.data?.nextDeparture, true)} detail={summaryQuery.data?.nextDeparture ? 'Earliest scheduled sailing' : 'No date currently available'} icon={<Clock3 className="h-4 w-4" />} />
          </section>

          <section className="mt-9">
            <div className="mb-4 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
              <div>
                <p className="eyebrow text-muted-foreground">Departure manifest</p>
                <div className="mt-1 flex flex-wrap items-center gap-3">
                  <h2 className="text-xl font-bold tracking-[-0.03em]">MSC sailings</h2>
                  <span data-testid="text-schedule-count" className="rounded-full bg-secondary px-2.5 py-1 font-mono text-[0.68rem] text-secondary-foreground">{formatCount(schedules.length)} shown</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {hasFilters && <button data-testid="button-clear-filters" type="button" onClick={clearFilters} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"><X className="h-3.5 w-3.5" /> Clear filters</button>}
                <button data-testid="button-toggle-filters" type="button" onClick={() => setShowFilters(!showFilters)} className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${showFilters || hasFilters ? 'border-primary/40 bg-primary/10 text-primary' : 'border-border bg-card text-foreground hover:bg-secondary'}`}>
                  <SlidersHorizontal className="h-4 w-4" /> Filters <span className="font-mono text-xs">{hasFilters ? String(activeFilterCount).padStart(2, '0') : ''}</span>
                </button>
              </div>
            </div>

            {showFilters && (
              <form data-testid="form-schedule-filters" onSubmit={submitFilters} className="mb-5 grid gap-3 rounded-2xl border border-primary/20 bg-primary/[0.035] p-4 md:grid-cols-[1.3fr_1fr_1fr_auto] md:items-end">
                <label className="block">
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
                      aria-describedby="destination-filter-help"
                      className="h-7 min-w-[10rem] flex-1 border-0 bg-transparent px-1 text-sm outline-none placeholder:text-muted-foreground/70"
                    />
                    <button data-testid="button-add-destination" type="button" onClick={addDestination} disabled={!destinationInput.trim()} className="rounded-md bg-sidebar px-2.5 py-1.5 text-xs font-bold text-sidebar-foreground transition-colors hover:bg-sidebar/90 disabled:cursor-not-allowed disabled:opacity-40">
                      Add
                    </button>
                  </div>
                  <p id="destination-filter-help" className="mt-1 text-[0.68rem] text-muted-foreground">Type a port or country, then click Add. Select × to remove it.</p>
                </label>
                <label className="block">
                  <span className="eyebrow text-muted-foreground">Departing from</span>
                  <input data-testid="input-departure-from" type="date" value={draft.departureFrom ?? ''} onChange={(event) => setDraft({ ...draft, departureFrom: event.target.value })} className="mt-2 h-10 w-full rounded-lg border border-input bg-card px-3 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/15" />
                </label>
                <label className="block">
                  <span className="eyebrow text-muted-foreground">Departing to</span>
                  <input data-testid="input-departure-to" type="date" value={draft.departureTo ?? ''} onChange={(event) => setDraft({ ...draft, departureTo: event.target.value })} className="mt-2 h-10 w-full rounded-lg border border-input bg-card px-3 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/15" />
                </label>
                <button data-testid="button-apply-filters" type="submit" className="h-10 rounded-lg bg-sidebar px-4 text-sm font-bold text-sidebar-foreground transition-colors hover:bg-sidebar/90">Apply</button>
              </form>
            )}

            {refreshMessage && <div data-testid="status-refresh-feedback" className={`mb-4 flex items-center gap-2 text-sm ${refreshMessage.includes('could not') ? 'text-destructive' : 'text-emerald-700'}`}><CheckCircle2 className="h-4 w-4" />{refreshMessage}</div>}

            {isError ? (
              <div data-testid="status-schedules-error" className="rounded-2xl border border-destructive/25 bg-destructive/5 px-6 py-10 text-center">
                <CircleAlert className="mx-auto h-7 w-7 text-destructive" />
                <h3 className="mt-4 font-bold">The board is unavailable</h3>
                <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">We couldn’t load the latest cached schedule. Check the connection and try refreshing the board.</p>
                <button data-testid="button-retry-schedules" type="button" onClick={() => { schedulesQuery.refetch(); summaryQuery.refetch(); }} className="mt-5 rounded-lg bg-sidebar px-4 py-2 text-sm font-bold text-sidebar-foreground transition-colors hover:bg-sidebar/90">Try again</button>
              </div>
            ) : isInitialLoading ? <ScheduleSkeleton /> : schedules.length === 0 ? (
              <div data-testid="status-schedules-empty" className="rounded-2xl border border-dashed border-border bg-card/60 px-6 py-14 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary text-primary"><Filter className="h-5 w-5" /></div>
                <h3 className="mt-4 font-bold">No sailings match this view</h3>
                <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">Try widening the destination or departure window. The carrier cache may also be between updates.</p>
                {hasFilters && <button data-testid="button-empty-clear-filters" type="button" onClick={clearFilters} className="mt-5 rounded-lg border border-border bg-card px-4 py-2 text-sm font-bold transition-colors hover:bg-secondary">Clear filters</button>}
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-[0_12px_30px_hsl(202_50%_17%/0.05)]">
                <div className="hidden grid-cols-[1.3fr_1fr_0.8fr_0.8fr_0.65fr_auto] gap-4 border-b border-border/70 bg-secondary/45 px-5 py-3 text-[0.65rem] font-bold uppercase tracking-[0.14em] text-muted-foreground md:grid">
                  <span>Destination</span><span>Vessel / voyage</span><span>Departure</span><span>Arrival</span><span>Transit</span><span className="text-right">Book</span>
                </div>
                <div className="divide-y divide-border/60">
                  {schedules.map((schedule, index) => (
                    <article data-testid={`row-schedule-${schedule.id}`} key={schedule.id} className="stagger-in grid gap-4 px-4 py-5 transition-colors duration-200 hover:bg-primary/[0.035] md:grid-cols-[1.3fr_1fr_0.8fr_0.8fr_0.65fr_auto] md:items-center md:px-5" style={{ animationDelay: `${Math.min(index, 8) * 45}ms` }}>
                      <div className="route-line pl-5">
                        <div className="flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full bg-primary ring-4 ring-primary/10" />
                        <p data-testid={`text-destination-${schedule.id}`} className="font-bold tracking-tight">
                          {schedule.destination}
                          {schedule.destinationCountry && <span className="ml-1 font-normal text-muted-foreground">· {schedule.destinationCountry}</span>}
                        </p>
                        </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {schedule.service || 'MSC service'} <span className="mx-1 text-border">/</span> from {schedule.origin}
                        {schedule.originCountry && <span>, {schedule.originCountry}</span>}
                      </p>
                      </div>
                      <div className="grid grid-cols-2 gap-3 md:block">
                        <div><p className="text-[0.62rem] uppercase tracking-wider text-muted-foreground md:hidden">Vessel / voyage</p><p data-testid={`text-vessel-${schedule.id}`} className="mt-1 font-semibold md:mt-0">{schedule.vessel}</p></div>
                        <p data-testid={`text-voyage-${schedule.id}`} className="font-mono text-xs text-muted-foreground md:mt-1">{schedule.voyage}</p>
                      </div>
                      <div><p className="text-[0.62rem] uppercase tracking-wider text-muted-foreground md:hidden">Departure</p><p data-testid={`text-departure-${schedule.id}`} className="mt-1 font-mono text-sm font-medium md:mt-0">{formatDate(schedule.departureDate)}</p></div>
                      <div><p className="text-[0.62rem] uppercase tracking-wider text-muted-foreground md:hidden">Arrival</p><p data-testid={`text-arrival-${schedule.id}`} className="mt-1 font-mono text-sm font-medium md:mt-0">{formatDate(schedule.arrivalDate)}</p></div>
                      <div className="flex items-center justify-between md:block"><div><p className="text-[0.62rem] uppercase tracking-wider text-muted-foreground md:hidden">Transit</p><p data-testid={`text-transit-${schedule.id}`} className="mt-1 font-mono text-sm font-medium md:mt-0">{schedule.transitTime || '—'}</p></div><Database className="h-4 w-4 text-muted-foreground/35 md:hidden" /></div>
                      <a data-testid={`button-book-${schedule.id}`} href={MSC_BOOKING_URL} target="_blank" rel="noreferrer" aria-label={`Book ${schedule.destination} sailing with MSC`} className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-primary/30 bg-primary/[0.06] px-3 py-2 text-xs font-bold text-primary transition-colors hover:border-primary/50 hover:bg-primary/12 md:justify-self-end">
                        Book with MSC
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </article>
                  ))}
                </div>
              </div>
            )}
          </section>

          <footer className="mt-7 flex flex-col gap-2 border-t border-border/60 pt-5 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <span data-testid="text-last-updated">Last captured {formatUpdated(schedulesQuery.data?.lastUpdated ?? summaryQuery.data?.lastUpdated)}</span>
            <span data-testid="text-source" className="inline-flex items-center gap-1.5"><Database className="h-3.5 w-3.5" /> Source: {schedulesQuery.data?.source || 'MSC schedule interface'}</span>
          </footer>
        </div>
      </main>
    </div>
  );
}

export default Dashboard;