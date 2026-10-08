import { DashboardView } from '../campaign/components/dashboard';
import NoCampaign from '../campaign/NoCampaign';
import { go, setCurrent, useCurrent } from '../campaign/lib/current';

// Outreach monitor. Every number comes from this app's own database; zero stays zero.
const Dashboard = ({ id }) => {
  const cur = useCurrent();
  const cid = id || cur.id;
  if (!cid) return <NoCampaign what="a dashboard" />;
  return (
    <div className="cv">
      <DashboardView key={cid} id={cid} go={go} onBusiness={(business) => setCurrent({ business })} />
    </div>
  );
};

export default Dashboard;
