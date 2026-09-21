export type ScheduleExportRow = {
  carrier: string;
  origin: string;
  originCountry: string | null;
  destination: string;
  destinationCountry: string | null;
  vessel: string;
  voyage: string;
  departureDate: string | null;
  arrivalDate: string | null;
  transitTime: string | null;
  service: string | null;
  bookingUrl: string;
};

export type ScheduleExportOptions = {
  rows: ScheduleExportRow[];
  formatDate: (value: string | null | undefined) => string;
  filters: {
    destinations?: string[];
    departureFrom?: string;
    departureTo?: string;
  };
};

const columns = [
  'Destination',
  'Country',
  'Carrier',
  'Origin',
  'Vessel',
  'Voyage',
  'Departure',
  'Arrival',
  'Transit',
  'Service',
  'Booking URL',
] as const;

const filenameDate = () => new Date().toISOString().slice(0, 10);

const valueOrDash = (value: string | null | undefined) => value || '—';

const getExportRows = ({ rows, formatDate }: ScheduleExportOptions) =>
  rows.map((schedule) => ({
    Destination: schedule.destination,
    Country: valueOrDash(schedule.destinationCountry),
    Carrier: schedule.carrier,
    Origin: schedule.originCountry
      ? `${schedule.origin}, ${schedule.originCountry}`
      : schedule.origin,
    Vessel: schedule.vessel,
    Voyage: schedule.voyage,
    Departure: formatDate(schedule.departureDate),
    Arrival: formatDate(schedule.arrivalDate),
    Transit: valueOrDash(schedule.transitTime),
    Service: valueOrDash(schedule.service),
    'Booking URL': schedule.bookingUrl,
  }));

const getFilterSummary = ({ filters }: ScheduleExportOptions) => {
  const parts = [
    filters.destinations?.length ? `Destination: ${filters.destinations.join(', ')}` : '',
    filters.departureFrom ? `From: ${filters.departureFrom}` : '',
    filters.departureTo ? `To: ${filters.departureTo}` : '',
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'All departures';
};

const downloadBlob = (content: BlobPart, type: string, filename: string) => {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

const escapeCsvValue = (value: string) => `"${value.replaceAll('"', '""')}"`;

export function exportSchedulesToCsv(options: ScheduleExportOptions) {
  const rows = getExportRows(options);
  const csv = [
    columns.join(','),
    ...rows.map((row) =>
      columns.map((column) => escapeCsvValue(String(row[column]))).join(','),
    ),
  ].join('\r\n');

  downloadBlob(`\uFEFF${csv}`, 'text/csv;charset=utf-8', `departure-manifest-${filenameDate()}.csv`);
}

export async function exportSchedulesToXlsx(options: ScheduleExportOptions) {
  const XLSX = await import('xlsx');
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(getExportRows(options), { header: [...columns] });
  worksheet['!cols'] = [
    { wch: 24 },
    { wch: 18 },
    { wch: 12 },
    { wch: 22 },
    { wch: 22 },
    { wch: 14 },
    { wch: 16 },
    { wch: 16 },
    { wch: 12 },
    { wch: 22 },
    { wch: 48 },
  ];
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Departure manifest');
  XLSX.writeFile(workbook, `departure-manifest-${filenameDate()}.xlsx`);
}

const truncate = (value: string, length: number) =>
  value.length > length ? `${value.slice(0, length - 1)}…` : value;

export async function exportSchedulesToPdf(options: ScheduleExportOptions) {
  const { jsPDF } = await import('jspdf');
  const rows = getExportRows(options);
  const document = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageWidth = document.internal.pageSize.getWidth();
  const pageHeight = document.internal.pageSize.getHeight();
  const left = 10;
  const tableTop = 34;
  const rowHeight = 6;
  const columnWidths = [35, 23, 18, 35, 34, 23, 24, 24, 18, 34];
  const rowColumns = [
    'Destination',
    'Country',
    'Carrier',
    'Origin',
    'Vessel',
    'Voyage',
    'Departure',
    'Arrival',
    'Transit',
    'Service',
  ] as const;

  const drawPageHeader = () => {
    document.setFont('helvetica', 'bold');
    document.setFontSize(16);
    document.text('Departure manifest', left, 14);
    document.setFont('helvetica', 'normal');
    document.setFontSize(8);
    document.text(getFilterSummary(options), left, 20);
    document.text(`${rows.length.toLocaleString('en-US')} sailings`, pageWidth - 10, 20, { align: 'right' });
    document.setFillColor(22, 52, 68);
    document.rect(left, 27, pageWidth - 20, 6, 'F');
    document.setTextColor(255, 255, 255);
    document.setFont('helvetica', 'bold');
    document.setFontSize(7);
    let x = left + 2;
    rowColumns.forEach((column, index) => {
      document.text(column, x, 31);
      x += columnWidths[index];
    });
    document.setTextColor(0, 0, 0);
  };

  let y = tableTop + rowHeight;
  drawPageHeader();
  document.setFont('helvetica', 'normal');
  document.setFontSize(6.5);

  rows.forEach((row, index) => {
    if (y + rowHeight > pageHeight - 10) {
      document.addPage();
      drawPageHeader();
      document.setFont('helvetica', 'normal');
      document.setFontSize(6.5);
      y = tableTop + rowHeight;
    }

    if (index % 2 === 0) {
      document.setFillColor(241, 246, 247);
      document.rect(left, y - 4.5, pageWidth - 20, rowHeight, 'F');
    }

    let x = left + 2;
    rowColumns.forEach((column, columnIndex) => {
      const maxCharacters = Math.max(8, Math.floor(columnWidths[columnIndex] / 1.55));
      document.text(truncate(String(row[column]), maxCharacters), x, y);
      x += columnWidths[columnIndex];
    });
    y += rowHeight;
  });

  document.setFontSize(7);
  document.setTextColor(100, 116, 125);
  document.text(
    `Generated ${new Date().toLocaleString('en-GB')} · Page ${document.getNumberOfPages()}`,
    left,
    pageHeight - 5,
  );
  document.save(`departure-manifest-${filenameDate()}.pdf`);
}