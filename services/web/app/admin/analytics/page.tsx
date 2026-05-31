import AnalyticsTable from '../../../components/analytics-table';

export default function AnalyticsPage() {
  return (
    <>
      <h1>Analytics</h1>
      <p className="muted" style={{ marginTop: -8, marginBottom: 16 }}>
        Compare impressions, clicks, and CTR across mock ads.
      </p>
      <AnalyticsTable />
    </>
  );
}
