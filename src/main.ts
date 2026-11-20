import './style.css';
import { bootstrap } from './app/bootstrap';
import { replayFromHash } from './app/config';

addEventListener('hashchange', (event) => {
  if (replayFromHash(new URL(event.oldURL).hash) !== replayFromHash(new URL(event.newURL).hash)) location.reload();
});
void bootstrap();
