public class NegativeReferences {
  // Label.Invoice_Title should not match
  /* System.Label.Invoice_Title should not match */
  public String demo() {
    String literal = 'System.Label.Invoice_Title';
    String quoted = 'FeatureManagement.checkPermission(\'Manage_Invoices\')';
    String page = 'Page.InvoicePrint';
    String query = 'SELECT Amount__c FROM Invoice__c';
    return literal + quoted + page + query;
  }
}
