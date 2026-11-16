public with sharing class FieldReferenceShowcase {
    public static Decimal inspectInvoices() {
        List<Invoice__c> invoices = [
            SELECT Amount__c, Status__c, Account__r.External_Id__c
            FROM Invoice__c WHERE Status__c = 'Draft'
        ];
        Decimal total = 0;
        for (Invoice__c invoice : invoices) {
            total += invoice.Amount__c;
            if (invoice.Account__r != null) {
                System.debug(invoice.Account__r.External_Id__c);
            }
        }
        return total;
    }
}
