'use strict';
/** Last-request-wins guard for command, file watcher, refresh, and panel lifecycle.
 * Expensive scans are serialized by AnalysisService; older results never commit.
 */
class LatestAnalysisController {
  constructor(){this.generation=0;this.disposed=false;}
  begin(){if(this.disposed)throw new Error('SFDV analysis controller is disposed');return ++this.generation;}
  isCurrent(request){return !this.disposed&&request===this.generation;}
  invalidate(){if(!this.disposed)++this.generation;}
  dispose(){this.disposed=true;this.generation++;}
}
module.exports={LatestAnalysisController};
