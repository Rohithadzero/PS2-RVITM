import { Empty, Button } from './components/ui';
import { navigate } from '../lib/router';

const NoCampaign = ({ what }) => (
  <div className="cv">
    <Empty title="No campaign yet">
      Answer a few questions first. Then {what} appears here.
    </Empty>
    <div style={{ marginTop: 16 }}>
      <Button variant="primary" onClick={() => navigate('voice')}>Start talking</Button>
    </div>
  </div>
);

export default NoCampaign;
