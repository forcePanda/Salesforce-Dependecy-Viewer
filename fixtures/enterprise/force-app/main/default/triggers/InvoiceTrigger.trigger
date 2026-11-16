trigger InvoiceTrigger on Invoice__c (before insert) { BillingService.calculate(); }
