# Data Processing Agreement (DPA) Template

**Version:** 1.0  
**Last Updated:** February 2026

---

## PARTIES

This Data Processing Agreement ("DPA") is entered into between:

**Controller:**  
[Customer Name] ("Customer" or "Controller")  
Address: [Customer Address]  
Contact: [Customer Contact Email]

**Processor:**  
Realyn Limited ("Realyn" or "Processor")  
Address: [Realyn Address]  
Contact: privacy@realyn.com

---

## 1. DEFINITIONS

1.1 **"Applicable Data Protection Laws"** means all applicable laws and regulations relating to the processing of Personal Data, including GDPR (EU) 2016/679, and any national implementing legislation.

1.2 **"Controller"** means the natural or legal person which determines the purposes and means of the Processing of Personal Data.

1.3 **"Data Subject"** means an identified or identifiable natural person whose Personal Data is Processed.

1.4 **"Personal Data"** means any information relating to an identified or identifiable natural person.

1.5 **"Personal Data Breach"** means a breach of security leading to the accidental or unlawful destruction, loss, alteration, unauthorized disclosure of, or access to, Personal Data.

1.6 **"Processing"** means any operation performed on Personal Data, such as collection, recording, storage, alteration, retrieval, use, disclosure, erasure, or destruction.

1.7 **"Processor"** means a natural or legal person which Processes Personal Data on behalf of the Controller.

1.8 **"Services"** means the chargeback management services provided by Realyn to the Customer under the main service agreement.

1.9 **"Sub-processor"** means any Processor engaged by Realyn to Process Personal Data on behalf of the Customer.

---

## 2. SCOPE AND PURPOSE

2.1 **Scope.** This DPA applies to all Processing of Personal Data by Realyn on behalf of the Customer in connection with the Services.

2.2 **Purpose.** Realyn will Process Personal Data solely for the purpose of providing the Services, which includes:
- Processing payment dispute data received from Payment Service Providers
- Storing and managing evidence documents for dispute responses
- Using AI services to analyze disputes and generate response recommendations
- Submitting dispute responses to Payment Service Providers

2.3 **Nature of Processing.** The Processing includes:
- Collection and storage of dispute data
- Automated processing for dispute management
- AI-powered analysis (with PII sanitization)
- Transmission of data to Sub-processors as necessary

---

## 3. CATEGORIES OF DATA AND DATA SUBJECTS

3.1 **Categories of Personal Data:**
- Transaction identifiers and amounts
- Dispute reason codes and dates
- Customer complaint text (sanitized before AI processing)
- Evidence document content
- Card last four digits (masked)

3.2 **Categories of Data Subjects:**
- Cardholders/customers who have filed chargebacks
- Guests/customers of the Controller's business

3.3 **Sensitive Data.** The Processor does not intentionally Process special categories of Personal Data (Article 9 GDPR) or criminal conviction data (Article 10 GDPR).

---

## 4. CONTROLLER OBLIGATIONS

4.1 The Controller shall:
- Ensure it has a lawful basis for Processing Personal Data
- Provide clear instructions to the Processor
- Ensure the accuracy and completeness of Personal Data provided
- Comply with Data Subject rights requests
- Notify the Processor of any changes to Processing instructions

---

## 5. PROCESSOR OBLIGATIONS

5.1 **Processing Instructions.** The Processor shall:
- Process Personal Data only on documented instructions from the Controller
- Inform the Controller if an instruction infringes Applicable Data Protection Laws
- Ensure persons authorized to Process Personal Data are bound by confidentiality

5.2 **Security Measures.** The Processor shall implement appropriate technical and organizational measures including:
- Encryption of Personal Data at rest (AES-256) and in transit (TLS 1.2+)
- Access controls and authentication mechanisms
- Regular security testing and vulnerability assessments
- Employee security training
- Incident response procedures

5.3 **PII Sanitization.** Before transmitting dispute data to AI Sub-processors, the Processor shall:
- Redact customer names with placeholder tokens
- Mask or remove email addresses
- Remove phone numbers
- Mask card numbers

5.4 **Data Minimization.** The Processor shall Process only the minimum Personal Data necessary for the Services.

---

## 6. SUB-PROCESSORS

6.1 **Authorization.** The Controller authorizes the Processor to engage Sub-processors listed at [Sub-processors page URL].

6.2 **Sub-processor Requirements.** The Processor shall:
- Enter into written agreements with Sub-processors imposing equivalent data protection obligations
- Remain liable for the acts and omissions of Sub-processors
- Maintain an up-to-date list of Sub-processors

6.3 **Changes to Sub-processors.** The Processor shall:
- Provide reasonable notice before adding or replacing Sub-processors
- Allow the Controller to object to new Sub-processors
- If the Controller objects and the objection is not resolved, the Controller may terminate the affected Services

6.4 **Current Sub-processors:**

| Sub-processor | Purpose | Location |
|---------------|---------|----------|
| OpenAI, LLC | AI dispute analysis | United States |
| Stripe, Inc. | Payment processing | USA/EU |
| Adyen N.V. | Payment processing | EU (Netherlands) |
| Google Cloud (Firebase) | Infrastructure | EU (configurable) |

---

## 7. DATA SUBJECT RIGHTS

7.1 **Assistance.** The Processor shall assist the Controller in responding to Data Subject requests to exercise their rights under Applicable Data Protection Laws, including:
- Right of access (Article 15 GDPR)
- Right to rectification (Article 16 GDPR)
- Right to erasure (Article 17 GDPR)
- Right to restriction (Article 18 GDPR)
- Right to data portability (Article 20 GDPR)
- Right to object (Article 21 GDPR)

7.2 **Process.** The Processor shall:
- Notify the Controller of any Data Subject request received directly
- Not respond directly to Data Subjects without Controller authorization
- Provide technical capabilities for data export and deletion

---

## 8. PERSONAL DATA BREACH

8.1 **Notification.** The Processor shall notify the Controller without undue delay (and in any event within 72 hours) after becoming aware of a Personal Data Breach affecting Controller data.

8.2 **Breach Information.** The notification shall include:
- Description of the nature of the breach
- Categories and approximate number of Data Subjects affected
- Categories and approximate number of Personal Data records affected
- Contact point for further information
- Likely consequences of the breach
- Measures taken or proposed to address the breach

8.3 **Cooperation.** The Processor shall cooperate with the Controller in investigating and remediating the breach.

---

## 9. DATA PROTECTION IMPACT ASSESSMENTS

9.1 The Processor shall assist the Controller in conducting Data Protection Impact Assessments (DPIAs) where required, including providing:
- Information about Processing operations
- Technical and organizational measures in place
- Assessment of risks and safeguards

---

## 10. AUDIT RIGHTS

10.1 **Audit.** The Controller may audit the Processor's compliance with this DPA:
- Upon reasonable notice (minimum 30 days)
- During regular business hours
- No more than once per year (unless a breach has occurred)
- Subject to confidentiality obligations

10.2 **Audit Scope.** Audits may include:
- Review of security measures and policies
- Inspection of data Processing systems
- Review of Sub-processor agreements
- Testing of technical controls

10.3 **Third-Party Audits.** The Controller may accept third-party audit reports (SOC 2, ISO 27001) in lieu of conducting its own audit.

---

## 11. DATA RETURN AND DELETION

11.1 **Upon Termination.** Upon termination of the Services or upon request:
- The Processor shall return all Personal Data to the Controller in a standard format
- The Processor shall delete all Personal Data within 30 days of return
- The Processor shall certify deletion in writing

11.2 **Retention Exceptions.** The Processor may retain Personal Data where required by Applicable Law, provided such data remains protected.

---

## 12. INTERNATIONAL DATA TRANSFERS

12.1 **Transfer Mechanisms.** Where Personal Data is transferred outside the EEA, the Processor shall ensure appropriate safeguards are in place:
- Standard Contractual Clauses (SCCs) approved by the European Commission
- Binding Corporate Rules where applicable
- Other approved transfer mechanisms

12.2 **US Transfers.** For transfers to the United States:
- Sub-processors certified under the EU-US Data Privacy Framework
- Standard Contractual Clauses as a supplementary measure

---

## 13. LIABILITY

13.1 **Processor Liability.** The Processor shall be liable for damages caused by Processing that does not comply with this DPA or the Controller's lawful instructions.

13.2 **Limitation.** Liability under this DPA is subject to the limitations in the main service agreement.

---

## 14. TERM AND TERMINATION

14.1 **Term.** This DPA shall remain in effect for the duration of the main service agreement.

14.2 **Survival.** Obligations relating to confidentiality, data return/deletion, and liability shall survive termination.

---

## 15. GENERAL PROVISIONS

15.1 **Governing Law.** This DPA shall be governed by [Applicable Law].

15.2 **Entire Agreement.** This DPA constitutes the entire agreement between the parties regarding data Processing and supersedes all prior agreements.

15.3 **Amendments.** This DPA may be amended only in writing signed by both parties.

15.4 **Severability.** If any provision is found unenforceable, the remaining provisions shall continue in effect.

---

## SIGNATURES

**Controller:**

Name: _______________________  
Title: _______________________  
Date: _______________________  
Signature: _______________________

**Processor (Realyn):**

Name: _______________________  
Title: _______________________  
Date: _______________________  
Signature: _______________________

---

## ANNEX A: TECHNICAL AND ORGANIZATIONAL MEASURES

The Processor implements the following security measures:

### A.1 Access Control
- Role-based access control (RBAC)
- Multi-factor authentication for administrative access
- Regular access reviews and deprovisioning
- Audit logging of all access

### A.2 Encryption
- Data at rest: AES-256-GCM encryption
- Data in transit: TLS 1.2 or higher
- Encryption key management via secure key vault
- No hardcoded encryption keys

### A.3 Data Minimization
- Collection limited to necessary data only
- PII sanitization before AI processing
- Automated data retention and deletion policies

### A.4 Infrastructure Security
- Cloud infrastructure with SOC 2 certification
- Network segmentation and firewalls
- Regular security patching
- DDoS protection

### A.5 Monitoring and Detection
- Security event logging
- Anomaly detection
- Regular vulnerability scanning
- Penetration testing (annual)

### A.6 Business Continuity
- Regular data backups
- Disaster recovery procedures
- Incident response plan
- Business continuity testing

### A.7 Personnel Security
- Background checks for employees
- Security awareness training
- Confidentiality agreements
- Principle of least privilege

---

## ANNEX B: SUB-PROCESSOR LIST

See [Sub-processors page URL] for the current list of authorized Sub-processors.

---

## ANNEX C: DATA PROCESSING DETAILS

| Element | Description |
|---------|-------------|
| Subject matter | Chargeback/dispute management services |
| Duration | Term of the main service agreement |
| Nature of Processing | Collection, storage, analysis, transmission |
| Purpose | Dispute response management |
| Data types | Transaction data, dispute data, evidence documents |
| Data subjects | Cardholders, customers |

---

*This template is provided for informational purposes. Consult legal counsel before use.*
