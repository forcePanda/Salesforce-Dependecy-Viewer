public with sharing class BillingService extends HelperClass {
    public static void calculate() {
        TaxCalculator.calculate();
        String name = 'FakeClass.compute(); // TaxCalculator';
        // FakeClass.compute();
        List<Invoice__c> invoices = [SELECT Id, Amount__c FROM Invoice__c LIMIT 10];
        Invoice__c record = new Invoice__c();
        System.debug('Invoice__c.NeverUsed__c');
    }
}
