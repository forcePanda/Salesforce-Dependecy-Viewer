import PERMITTED from '@salesforce/customPermission/Manage_Invoices';
import KEY from '@salesforce/schema/Invoice__c.Account__r.External_Id__c';
import amount from '@salesforce/schema/Invoice__c.Amount__c';
import useBill from '@salesforce/apex/BillingService.run';
const irrelevant = "import BAD from '@salesforce/customPermission/Nonexistent'";
export default class DiscoveryWidget {}
