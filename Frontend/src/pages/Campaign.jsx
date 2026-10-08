import { CampaignView } from '../campaign/components/campaign';
import NoCampaign from '../campaign/NoCampaign';
import { go, setCurrent, useCurrent } from '../campaign/lib/current';

// S7: Campaign 0. Every asset shown as the surface it will appear on, with its fact and meaning checks.
const Campaign = ({ id }) => {
  const cur = useCurrent();
  const cid = id || cur.id;
  if (!cid) return <NoCampaign what="Campaign 0" />;
  return (
    <div className="cv">
      <CampaignView key={cid} id={cid} go={go} onBusiness={(business) => setCurrent({ business })} />
    </div>
  );
};

export default Campaign;
