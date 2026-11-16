public with sharing class ExpandedDiscovery {
  public String analyze(Invoice__c current) {
    String caption = System.Label.Invoice_Title;
    Boolean permitted = FeatureManagement.checkPermission('Manage_Invoices');
    PageReference pageRef = Page.InvoicePrint;
    List<Account> accounts = [
      SELECT Id, (SELECT Amount__c, Status__c FROM Invoices__r)
      FROM Account
    ];
    List<Invoice__c> invoices = [
      SELECT Amount__c, Account__r.External_Id__c FROM Invoice__c
    ];
    // Page.Nonexistent and Label.Fake_Label are not references
    String irrelevant = 'FeatureManagement.checkPermission(\'Missing_Permission\')';
    return caption;
  }
}
