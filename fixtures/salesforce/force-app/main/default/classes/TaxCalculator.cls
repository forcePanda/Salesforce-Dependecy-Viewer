public with sharing class TaxCalculator {
    public static void calculate() {
        HelperClass helper = new HelperClass();
        Invoice__c invoice = new Invoice__c();
        List<Invoice__c> records = [SELECT Id FROM Invoice__c];
    }
}
