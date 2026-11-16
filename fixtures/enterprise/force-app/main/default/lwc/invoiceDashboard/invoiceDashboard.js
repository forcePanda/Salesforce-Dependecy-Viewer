import getTax from '@salesforce/apex/TaxCalculator.calculate';
import AMOUNT from '@salesforce/schema/Invoice__c.Amount__c';
import INVOICE from '@salesforce/schema/Invoice__c';
import TITLE from '@salesforce/label/c.Invoice_Title';
import styles from '@salesforce/resourceUrl/InvoiceStyles';
import CHANNEL from '@salesforce/messageChannel/InvoiceUpdates__c';
import invoiceTile from 'c/invoiceTile';
export default class InvoiceDashboard {}
