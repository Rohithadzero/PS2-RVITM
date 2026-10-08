import { PlanView } from '../campaign/components/plan';
import NoCampaign from '../campaign/NoCampaign';
import { go, setCurrent, useCurrent } from '../campaign/lib/current';

// S4: what the owner said, as a plan. Each line carries the owner's own quote and the schedule is computed by rule.
const Plan = ({ id }) => {
  const cur = useCurrent();
  const cid = id || cur.id;
  if (!cid) return <NoCampaign what="a plan" />;
  return (
    <div className="cv">
      <PlanView key={cid} id={cid} go={go} onBusiness={(business) => setCurrent({ business })} />
    </div>
  );
};

export default Plan;
