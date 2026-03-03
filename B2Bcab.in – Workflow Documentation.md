# B2Bcab.in – Workflow Documentation

**B2Bcab.in – Workflow Documentation**

**Purpose of The Document**

This document defines the complete functional and operational workflows for the Savaari B2B Cab Platform (www.b2bcab.in). It is to ensure a shared understanding of how the B2B cab platform operates.

B2BCAB.in is a B2B-only cab booking platform designed specifically for travel agents. The platform allows agents to log in, create cab bookings for their customers, manage those bookings, apply their own mark-ups, and track business through reports.

**Who Uses B2BCAB.in**

Travel Agent (Primary User), Retail travel agents, Corporate travel agents.

Important: Guests (end customers) do not log in to this platform. All bookings are created and managed by agents.

**Agent Login Flow**

1. Agent visits [www.b2bcab.in](http://www.b2bcab.in)   
2. Agent logs in using registered credentials  
3. On successful login, the agent is redirected to the Agent Home Page.

**Home Page Overview**

After login, the agent sees the home, which acts as the control center for all activities.

The home page provides access to:

1. Create a new booking (Explore Cabs)  
2. View existing bookings  
3. Generate reports  
4. Manage mark-up settings  
5. Update account details  
6. Log out securely

**Booking Creation Workflow**

**1\. Create New Booking**

From the Home page, the agent can create a new booking by selecting one of the following booking types:   
    One Way Trip – Pickup location, drop location, and travel date & time.  
    Round Trip – Pickup location, one or multiple drop locations, along with start date & time and return date & time.  
    Local Trip – Fixed packages (e.g., 8 Hours / 80 KM, 12 Hours / 120 KM) can be selected after entering the pickup location and travel date and time.   
    Airport Trip – Two options are available: airport pickup or airport drop. The agent needs to enter the pickup or drop location along with the travel date and time.

**2\. Enter Trip Details**

For all booking types, the agent provides:  
    Vehicle type selection  
    Pickup address  
    Drop address (where applicable)  
    Date & time  
    Customer (guest) details

**3\. Price Display & Mark-up Application**

System shows the base system price (not visible to the guest)  
    Agent’s predefined mark-up is applied automatically  
    Final sell price is calculated  
    The agent can control what price is charged to the customer.  
Some cases showing bill to company option.

**4\. Booking Confirmation**

Agent reviews booking summary and Confirms booking.  
Booking ID will be generated.  
Booking moves to the Upcoming Bookings section

**Bookings Section**

The **Bookings** menu allows the agent to manage all created bookings.

**1\. Upcoming Bookings**

Shows all future and active trips

Agent can: View booking details, Track status and cancel bookings.

**2\. Completed Bookings**

Shows trips that have been successfully completed

**3\. Cancelled Bookings**

Shows bookings cancelled by agent or system, displays cancellation status.

**Reports Section**

The Reports section helps agents track their business performance.

Agents can select the date range and click on ‘view’ to see the list of all trips executed within the selected period. The report will be downloaded in excel format.

**Mark-up Settings**

The Mark-up Settings section allows agents to define their earnings.

Agent can:   
Set mark-up as a percentage or a fixed amount.  
Set mark-up as Trip-type-wise (Airport Transfers, Local Rentals, Outstation).

**Account Settings**

The Account Settings section allows agents to manage their profile.

Agents can update his latest details here. For updating email id or GST number please contact B2b Cab customer care.

**Log Out**

Agent can log out safely using the Log Out option

# Internal Wallet System Development Flow

# **Internal Wallet System – Development Flow**

## **Overall Objective**

The Internal Wallet System allows B2B agents to prepay or maintain balances and use them seamlessly while creating bookings.  
It acts as a controlled financial layer between booking creation and trip completion.

## **Wallet Development Flow**

### **Step 1: Agent & Wallet Creation**

* Agent can create a wallet account from Manage Wallet page in B2Bcab

* System auto-creates a wallet account

* Initial balance \= 0

* Wallet status \= Active

### **Step 2: Wallet Top-Up Flow** 

* Agent raises a wallet top-up request from Manage Wallet page in B2Bcab

* The agent transfers the amount via online payment (Pine Labs or Razorpay)/ bank / UPI.

* Finance verifies the payment in case of Manual payment(Bank or UPI) and credit wallet.

* Wallet balance updated

* Credit transaction recorded.

### **Step 3: Booking Creation Using Wallet**

* Agent creates booking (One Way / Round / Local / Airport)

* System calculates base booking amount,  
  Agent selects Wallet as payment method

* System checks available wallet balance

* The required amount will be detected from the balance and wallet balance updated.

* Booking is confirmed

### **Step 4: Cancellation Handling**

* Booking cancelled

* Cancellation policy evaluated

* Wallet refund applied:

  * Full / Partial / No refund (Based on cancellation policy)

* Refund transaction logged

### **Step 5: Admin side dashboard for Handle Admin activities.**

* Admin user want list all wallet account 

* Have to manage the wallet status.

* Have to view all the transaction reports.

* Need option for finance team to verify the top up payment in case of Manual payment and need option for approve/reject.


## 

## 

## **Wallet Flowchart**

`Agent Initiate Wallet Creation and Approved.`  
      `|`  
`Wallet Auto-Created`  
      `|`  
`Wallet Top-Up`  
      `|`  
`Finance Approval (Incase of manual payment(Bank/UPI/..))`  
      `|`  
`Wallet Credited`  
      `|`  
`Booking Created`  
      `|`  
`Wallet Balance Check`  
      `|`  
`If Sufficient Balance?`  
   `/       	 \`  
 `Yes       	 No`  
  `|        	  |`  
`Wallet Adjusted  Booking Failed`  
  `|`  
`Booking Confirmed`  
  `|`  
`Transaction Logged`  
  `|`  
`If Trip Canceled`  
  `|`  
`Wallet Refund Updated`  
  `|`  
`Transaction Logged`

## **Database Table Design**

### **1\. Agent wallet**

Stores current wallet state per agent.

Table Name: sv\_`agent_wallet`

| Column | Type | Description |
| :---- | :---- | :---- |
| wallet\_id | bigint | Unique wallet ID |
| agent\_id | bigint | Agent reference |
| current\_balance | decimal | Total balance |
| credit\_limit | decimal | Allowed negative limit |
| wallet\_status | enum | Active / Frozen |
| created\_at | datetime | Created time |
| updated\_at | datetime | Last update |

### **2\. Wallet transactions**

Complete wallet ledger.

Table Name: sv\_`wallet_transactions`

| Column | Type | Description |
| :---- | :---- | :---- |
| transaction\_id | bigint | Unique ID |
| wallet\_id | bigint | Wallet reference |
| agent\_id | bigint | Agent |
| booking\_id | bigint | Booking reference |
| transaction\_type | enum | Credit / Debit |
| amount | decimal | Amount |
| balance\_before | decimal | Opening balance |
| balance\_after | decimal | Closing balance |
| remarks | varchar | Reason |
| created\_at | datetime | Timestamp |

### **3\. Wallet topup requests**

Tracks agent top-up requests.

Table Name: sv\_`wallet_topup_requests`

| Column | Type | Description |
| :---- | :---- | :---- |
| request\_id | bigint | Request ID |
| agent\_id | bigint | Agent |
| amount | decimal | Requested amount |
| payment\_mode | varchar | Bank / UPI / .. |
| status | enum | Pending / Approved / Rejected |
| approved\_by | bigint | Admin |
| created\_at | datetime | Created time |
| updated\_at | datetime | Last update |

### **4\. Wallet Action Logs**

This table tracks who did what to the wallet, even if no money moved.

Table Name: sv\_`wallet_action_logs`

| Column | Type | Description |
| :---- | :---- | :---- |
| id | bigint | Unique log ID |
| agent\_id | bigint | Agent |
| action\_type | varchar | Wallet Creation / Transaction / Admin Updates / Adjustments |
| action\_source | enum | Admin Panel / b2bcab |
| old\_value | text | Previous value/state |
| new\_value | text | Updated value/state |
| reason | varchar | Mandatory reason for action |
| ip\_address | varchar | IP from where action was taken |
| created\_at | datetime | Action timestamp |

# Existing B2B APIs list

STEP1 \- LOGIN / REGISTER  
\==================================

[https://api.betasavaari.com/partner\_api/public/auth/webtoken](https://api.betasavaari.com/partner_api/public/auth/webtoken)

[https://api23.betasavaari.com/user/login](https://api23.betasavaari.com/user/login)

[https://api.betasavaari.com/partner\_api/public/forgot\_password?token=eyJ0eXAi](https://api.betasavaari.com/partner_api/public/forgot_password?token=eyJ0eXAi)

[https://api.betasavaari.com/partner\_api/public/new\_registration?token=eyJ0eXAiOiJKV1Qi](https://api.betasavaari.com/partner_api/public/new_registration?token=eyJ0eXAiOiJKV1Qi)

STEP2 \- Home  
\==================================

[https://api.betasavaari.com/partner\_api/public/auth/webtoken](https://api.betasavaari.com/partner_api/public/auth/webtoken)

[https://api23.betasavaari.com/banner-images-list?sourceCity=\&seoType=500](https://api23.betasavaari.com/banner-images-list?sourceCity=&seoType=500)

[https://api.betasavaari.com/partner\_api/public/source-cities?tripType=outstation\&subTripType=roundTrip\&token=eyJ0eXAiOiJKV](https://api.betasavaari.com/partner_api/public/source-cities?tripType=outstation&subTripType=roundTrip&token=eyJ0eXAiOiJKV)

[https://api.betasavaari.com/partner\_api/public/chardham-cities?token=eyJ0eXAiOiJ](https://api.betasavaari.com/partner_api/public/chardham-cities?token=eyJ0eXAiOiJ)

[https://api.betasavaari.com/partner\_api/public/web-trip-types?token=eyJ0eXAiOiJKV1Q](https://api.betasavaari.com/partner_api/public/web-trip-types?token=eyJ0eXAiOiJKV1Q)

[https://api.betasavaari.com/partner\_api/public/date\_time](https://api.betasavaari.com/partner_api/public/date_time)

[https://api.betasavaari.com/partner\_api/public/destination-cities?tripType=outstation\&subTripType=oneWay\&token=eyINJ0g6MNg\&sourceCity=400](https://api.betasavaari.com/partner_api/public/destination-cities?tripType=outstation&subTripType=oneWay&token=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzUxMiJ9.eyJpYXQiOjE3NzAyNjYxNTMsImp0aSI6Im9pZHFHeFUwc2E4Uk03QWJFU0pEcFByYUQ4QkZKbHVaQW5sbWg2dnpPWWM9IiwiaXNzIjoic2F2YWFyaSIsIm5iZiI6MTc3MDI2NjE1MywiZXhwIjoxNzc5NzcwMTUzLCJkYXRhIjp7ImFwaUtleSI6ImY2NDVkYmM3Y2Q0YmExN2NhZjRmYWM4YWJjNTNkYzAyYTAxMjMxZGRlN2VjMWMzMTEyNDg5NWFhMGZkMjQxNjYiLCJhcHBJZCI6IjczNTg5MjEwM2YxMWJlZTM2ZTk3Y2E1NGQ3YWQ4YjJjIn19.r7aybJES5E_UM0bsd8rzwwJJ1tO8XXWqzcUPVOg0vTDCNnnyIlkZa_rt5rio9riagUuvjXZ8HLrgH-NJ0g6MNg&sourceCity=400)

STEP 3 \- Select Cars  
\==============================

[https://api23.betasavaari.com/user/get-commission?userEmail=bincy.joseph@savaari.com\&token=eyJhbGciOiJSUz](https://api23.betasavaari.com/user/get-commission?userEmail=bincy.joseph@savaari.com&token=eyJhbGciOiJSUzI1NiJ9.eyJ1c2VyRW1haWwiOiJiaW5jeS5qb3NlcGhAc2F2YWFyaS5jb20iLCJleHAiOjE4MDE4MDIxNTEsImlhdCI6MTc3MDI2NjE1MX0.aR1xXliG8SGBybNfsvuEUWO4OyaTu46D1APXvRjRxWxknOF7Rk_YVTI8yFl_wwvt8CUbFeDq_Jfuy3XZwFOIs9LKRq1Is5CQSr345wViCml6H6VrFrGoziaF30KT-PgX4LB7_dh-ZJyotGNHgKdb8Snr5Gxri_f0T6UMjzgOueJ9yawn1ILkIdZZoABZXs44Zx7xskbqObn3aasWhiyj-Z19fgTdyG49A4j269zHweg17exO19-owA2ecApkgdxFctMUulmEPgDgqTu3g8Tj-5TdcyzJxd6x2Kbnj7jBhASfQHtf_zoGg1GjHNeT3qyKRpx27QYY09lrekQtzheussXDzD54mfsiZUeGbcCqzo9U555e4w3ONDUMl6GEOevx10JhGDqqC5YMFFHCQImOUQHJM1umuHRbiWXObwP8HKklL8S8_WK5qzeDSVK8NbWkHg7cb2ThbomxBYeCePUVQ-GnvgeSD0h3uamiTlAXNs07ny06PCi7pyvzspJ6kWheeESRNP_9tI-n8kabhMrG68RtsQyXaTPqyfKqzi_iCqdAqoPj6oThjCUcvYuCGr4OmKGmtsbUWbvvV-rBsID16crMqV7mac4vTjJgFrBi_5zTqOrLR8MwyzsQ42MX8gwhtgG0JeZ4-FgVlsXZV1hZpAkOCfC1zwAxxRZQyYj8kqc)

[https://api.betasavaari.com/partner\_api/public/availabilities?rate\_source=web\&rate\_type=premium\&sourceCity=400\&tripType=outstation\&subTripType=oneWay\&pickupDateTime=07-02-2026%2006:30\&duration=1\&destinationCity=2754\&token=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzMNg\&agentId=Mjg3NTg0\&api\_source=b2b](https://api.betasavaari.com/partner_api/public/availabilities?rate_source=web&rate_type=premium&sourceCity=400&tripType=outstation&subTripType=oneWay&pickupDateTime=07-02-2026%2006:30&duration=1&destinationCity=2754&token=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzUxMiJ9.eyJpYXQiOjE3NzAyNjYxNTMsImp0aSI6Im9pZHFHeFUwc2E4Uk03QWJFU0pEcFByYUQ4QkZKbHVaQW5sbWg2dnpPWWM9IiwiaXNzIjoic2F2YWFyaSIsIm5iZiI6MTc3MDI2NjE1MywiZXhwIjoxNzc5NzcwMTUzLCJkYXRhIjp7ImFwaUtleSI6ImY2NDVkYmM3Y2Q0YmExN2NhZjRmYWM4YWJjNTNkYzAyYTAxMjMxZGRlN2VjMWMzMTEyNDg5NWFhMGZkMjQxNjYiLCJhcHBJZCI6IjczNTg5MjEwM2YxMWJlZTM2ZTk3Y2E1NGQ3YWQ4YjJjIn19.r7aybJES5E_UM0bsd8rzwwJJ1tO8XXWqzcUPVOg0vTDCNnnyIlkZa_rt5rio9riagUuvjXZ8HLrgH-NJ0g6MNg&agentId=Mjg3NTg0&api_source=b2b)

STEP 4 \- Booking  
\==============================

[https://api23.betasavaari.com/country-code](https://api23.betasavaari.com/country-code)

[https://api.betasavaari.com/partner\_api/public/localities?sourceCity=400\&token=eyJ0eXAiOiJKV1QiL](https://api.betasavaari.com/partner_api/public/localities?sourceCity=400&token=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzUxMiJ9.eyJpYXQiOjE3NzAyNjYxNTMsImp0aSI6Im9pZHFHeFUwc2E4Uk03QWJFU0pEcFByYUQ4QkZKbHVaQW5sbWg2dnpPWWM9IiwiaXNzIjoic2F2YWFyaSIsIm5iZiI6MTc3MDI2NjE1MywiZXhwIjoxNzc5NzcwMTUzLCJkYXRhIjp7ImFwaUtleSI6ImY2NDVkYmM3Y2Q0YmExN2NhZjRmYWM4YWJjNTNkYzAyYTAxMjMxZGRlN2VjMWMzMTEyNDg5NWFhMGZkMjQxNjYiLCJhcHBJZCI6IjczNTg5MjEwM2YxMWJlZTM2ZTk3Y2E1NGQ3YWQ4YjJjIn19.r7aybJES5E_UM0bsd8rzwwJJ1tO8XXWqzcUPVOg0vTDCNnnyIlkZa_rt5rio9riagUuvjXZ8HLrgH-NJ0g6MNg)

[https://api.betasavaari.com/partner\_api/public/booking?token=eyJ0eXAiOiJKV1QiLCJhbGciOi](https://api.betasavaari.com/partner_api/public/booking?token=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzUxMiJ9.eyJpYXQiOjE3NzAyNjYxNTMsImp0aSI6Im9pZHFHeFUwc2E4Uk03QWJFU0pEcFByYUQ4QkZKbHVaQW5sbWg2dnpPWWM9IiwiaXNzIjoic2F2YWFyaSIsIm5iZiI6MTc3MDI2NjE1MywiZXhwIjoxNzc5NzcwMTUzLCJkYXRhIjp7ImFwaUtleSI6ImY2NDVkYmM3Y2Q0YmExN2NhZjRmYWM4YWJjNTNkYzAyYTAxMjMxZGRlN2VjMWMzMTEyNDg5NWFhMGZkMjQxNjYiLCJhcHBJZCI6IjczNTg5MjEwM2YxMWJlZTM2ZTk3Y2E1NGQ3YWQ4YjJjIn19.r7aybJES5E_UM0bsd8rzwwJJ1tO8XXWqzcUPVOg0vTDCNnnyIlkZa_rt5rio9riagUuvjXZ8HLrgH-NJ0g6MNg)

[https://api.betasavaari.com/partner\_api/public/booking/update\_invoice\_payer\_info?token=eyJ0eXAiOiJKV1QiLCJh](https://api.betasavaari.com/partner_api/public/booking/update_invoice_payer_info?token=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzUxMiJ9.eyJpYXQiOjE3NzAyNjYxNTMsImp0aSI6Im9pZHFHeFUwc2E4Uk03QWJFU0pEcFByYUQ4QkZKbHVaQW5sbWg2dnpPWWM9IiwiaXNzIjoic2F2YWFyaSIsIm5iZiI6MTc3MDI2NjE1MywiZXhwIjoxNzc5NzcwMTUzLCJkYXRhIjp7ImFwaUtleSI6ImY2NDVkYmM3Y2Q0YmExN2NhZjRmYWM4YWJjNTNkYzAyYTAxMjMxZGRlN2VjMWMzMTEyNDg5NWFhMGZkMjQxNjYiLCJhcHBJZCI6IjczNTg5MjEwM2YxMWJlZTM2ZTk3Y2E1NGQ3YWQ4YjJjIn19.r7aybJES5E_UM0bsd8rzwwJJ1tO8XXWqzcUPVOg0vTDCNnnyIlkZa_rt5rio9riagUuvjXZ8HLrgH-NJ0g6MNg)

[https://b2bcab.betasavaari.com/payment\_confirmation/advance\_payment\_check.php](https://b2bcab.betasavaari.com/payment_confirmation/advance_payment_check.php)

[https://api.betasavaari.com/partner\_api/public/apply\_coupon?token=eyJ0eXAiOiJKV1QiLCJ](https://api.betasavaari.com/partner_api/public/apply_coupon?token=eyJ0eXAiOiJKV1QiLCJ)

STEP 5 \- booking-details  
\==============================

[https://api23.betasavaari.com/booking-details?userEmail=bincy.joseph@savaari.com\&token=eyJhbGciOiJZQyYj8kqc](https://api23.betasavaari.com/booking-details?userEmail=bincy.joseph@savaari.com&token=eyJhbGciOiJSUzI1NiJ9.eyJ1c2VyRW1haWwiOiJiaW5jeS5qb3NlcGhAc2F2YWFyaS5jb20iLCJleHAiOjE4MDE4MDIxNTEsImlhdCI6MTc3MDI2NjE1MX0.aR1xXliG8SGBybNfsvuEUWO4OyaTu46D1APXvRjRxWxknOF7Rk_YVTI8yFl_wwvt8CUbFeDq_Jfuy3XZwFOIs9LKRq1Is5CQSr345wViCml6H6VrFrGoziaF30KT-PgX4LB7_dh-ZJyotGNHgKdb8Snr5Gxri_f0T6UMjzgOueJ9yawn1ILkIdZZoABZXs44Zx7xskbqObn3aasWhiyj-Z19fgTdyG49A4j269zHweg17exO19-owA2ecApkgdxFctMUulmEPgDgqTu3g8Tj-5TdcyzJxd6x2Kbnj7jBhASfQHtf_zoGg1GjHNeT3qyKRpx27QYY09lrekQtzheussXDzD54mfsiZUeGbcCqzo9U555e4w3ONDUMl6GEOevx10JhGDqqC5YMFFHCQImOUQHJM1umuHRbiWXObwP8HKklL8S8_WK5qzeDSVK8NbWkHg7cb2ThbomxBYeCePUVQ-GnvgeSD0h3uamiTlAXNs07ny06PCi7pyvzspJ6kWheeESRNP_9tI-n8kabhMrG68RtsQyXaTPqyfKqzi_iCqdAqoPj6oThjCUcvYuCGr4OmKGmtsbUWbvvV-rBsID16crMqV7mac4vTjJgFrBi_5zTqOrLR8MwyzsQ42MX8gwhtgG0JeZ4-FgVlsXZV1hZpAkOCfC1zwAxxRZQyYj8kqc)

STEP 6 \- Commission  
\==============================

[https://api23.betasavaari.com/user/get-commission?userEmail=jibin.jose@savaari.com\&token=eyJhbGciO](https://api23.betasavaari.com/user/get-commission?userEmail=jibin.jose@savaari.com&token=eyJhbGciO)

STEP 7 \- Reports  
\==============================

[https://api23.betasavaari.com/booking-details-report?userEmail=bincy.joseph@savaari.com\&token=eyJhbGciOiyYj8kqc\&fromDate=1769884200\&toDate=1770270740.86](https://api23.betasavaari.com/booking-details-report?userEmail=bincy.joseph@savaari.com&token=eyJhbGciOiyYj8kqc&fromDate=1769884200&toDate=1770270740.86)

STEP 8 \- Account  
\==============================

[https://api23.betasavaari.com/user/update-profile](https://api23.betasavaari.com/user/update-profile)

[https://api23.betasavaari.com/user](https://api23.betasavaari.com/user)

# Onboarding and Internal Wallet Dev Planning doc

**Development planning document**

The current B2B platform is built on an older version, and upgrading it directly is not technically feasible. So building new B2B on Top of B2C Platform copy

we are planning to:

Clone the existing B2C platform  
Convert it into a B2B version  
Modify required flows and APIs for agent logic  
Integrate an internal wallet system  
Ensure compatibility with existing B2B agent data

**High-Level Strategy**

We will:

Create a separate B2B environment based on B2C latest version

Audit all B2C and B2B APIs, Compare them against B2B requirements.

Modify / extend APIs where required

Add internal wallet system in B2B specific controls

**Tasks**

Create codebase copy of B2C for create new B2B environment

Disable guest-facing flows and update B2B related flows (UI Changes)

List out all B2B and B2C APIs to compare and update agent related flows

Total 19 APIs identified in existing B2B and need to identify similar functional APIs in B2C

**Internal Wallet System – Task List**

**Architecture & Planning Tasks \- Requirement Finalization**

- Define wallet behavior (Prepaid)  
    
- Define debit timing (Booking confirmation / Trip completion)  
    
- Define refund rules  
    
- Define cancellation policy impact  
    
- Define credit limit logic (if allowed)  
    
- Define transaction states

**Technical Design**

- Define wallet DB schema  
    
- Define transaction atomicity strategy  
    
- Define locking mechanism (row-level locking)  
    
- Define API response structure  
    
- Define error codes  
    
- Define audit logging format

**Wallet Core APIs**

- Create Wallet API  
    
- Wallet top-up request API  
    
- Get Wallet Balance API  
    
- Booking API need to update with necessary actions for Wallet bookings  
    
- Wallet Transaction History API

**Agent Side UI**

    Wallet Dashboard Page

* Show: Current Balance / Available Balance  
    
* Transaction History table  
    
* Date filter  
    
* Pagination

    Booking Flow Update

    Payment Section:

* Add “Wallet” payment option  
    
* Show available balance  
    
* Disable if insufficient  
    
* Show warning if balance low  
    
* Confirm before deduction

    Wallet Transaction History Page

**Admin Side UI**

    Wallet Management Page

* List agents

* Search agent

* View wallet balance

* View transaction history

* Top-up request manage option

* Enable or Disable options

* Reason input mandatory  
  


# Website API List

STEP1 \- home page  
\==================================  
/deviceinfo/deviceinfo             \- for saving device info  
/geolocation/geolocation\_info        \- IP address info  
/partner\_api/public/auth/webtoken  \- token generation for call API  
/partner\_api/public/analytics\_data \- for LOG DB data  
/partner\_api/public/destination-cities destination city list  
/partner\_api/public/airport-list   \- for airport list  
/partner\_api/public/source-cities  \- for pickup city list  
/partner\_api/public/date\_time      \- for date time dropdown list  
/partner\_api/public/web-trip-types \- for trip types

/savaari/public/home-page-content \- for SEO pages  
/savaari/public/seo-content          \- for SEO pages        

STEP 2 \- rate page  
\==============================  
/partner\_api/public/availabilities \- for getting rate  
/partner\_api/public/analytics\_data

STEP 3 \- bookig page  
\==============================  
/partner\_api/public/analytics\_data  
/userlogin/public/country-code \- for country ISD code dropdown list  
/partner\_api/public/booking    \- for creating booking  
/partner\_api/public/localities \-  
/partner\_api/public/vas\_booking\_update \- for VAS  
/partner\_api/public/apply\_coupon  
/partner\_api/public/remove\_coupon  
/partner\_api/public/update\_gst \- for updating GST

/partner\_api/public/send\_login\_otp \- for cash booking guest user  
/userlogin/public/user/otplogin    \- for cash booking guest user

STEP 4 \- confirmation page  
\==============================  
/partner\_api/public/analytics\_data  
/partner\_api/public/booking/update\_payment\_info  
/partner\_api/public/booking\_update  
/partner\_api/public/email\_sent

login user flow  
\==============================  
/partner\_api/public/send\_login\_otp  
/userlogin/public/user/otplogin

/userlogin/public/user/autologin  
/userlogin/public/booking-details  
/userlogin/public/booking-edit

POST BOOKING  
\=============================

/partner\_api/public/customer\_app\_enquiry  
/partner\_api/public/customer\_booking\_pdf  
/partner\_api/public/feedback  
/partner\_api/public/final\_bill  
/partner\_api/public/getgroupbookingdetails  
/partner\_api/public/live\_tracking  
/partner\_api/public/live\_tracking\_feedback  
/partner\_api/public/system\_bookings\_cancellation  
/partner\_api/public/travelkit\_details

# TRD For B2Bcab Internal Wallet System

# **TRD For B2Bcab Internal Wallet System**

## **1\. System Architecture & Overview**

The system enables agents to maintain a digital wallet to pay for cab bookings. It supports prepaid top-ups via Razorpay. The backend ensures data integrity through a ledger-based transaction system. 

---

## **2\. Database Design (Schema)**

### **A. Table: wallets**

Holds the current wallet state and balance settings for each agent. 

| Column 		| Type 			| Description 					| 

| id			| UUID (PK) 		| Unique ID for the wallet. 			|

| agent\_id 		| UUID (FK) 		| Reference to the Agent table.		|

| balance 		| DECIMAL(18,2) 	| Current cash balance (Must be \>=  0).	|

| status 		| ENUM 		| PENDING, ACTIVE, BLOCKED,CLOSED.	|

| block\_reason 	| TEXT 		| Reason for BLOCKED/CLOSED		|

| bank\_name		| STRING		| Name of the Bank.				|

| account\_holder	| STRING		| Name as per Bank Records.		|

| account\_number	| STRING		| Encrypted or Masked Account Number.	|

| ifsc\_code		| STRING		| Bank IFSC Code.				|

| last\_updated 		| TIMESTAMP 	| Format: YYYY-MM-DD HH:mm:ss. 		|

| created\_date 	| TIMESTAMP 	| Format: YYYY-MM-DD HH:mm:ss. 		|

### **B. Table: wallet\_transactions** 

The immutable record of every penny moved. 

| Column 		| Type 			| Description 					|

| id 			| UUID (PK) 		| Unique transaction ID. 			|

| wallet\_id 		| UUID (FK) 		| Reference to wallets.id. 			|

| credit\_amount 	| DECIMAL(18,2) 	| Credits/Top-ups.				|

| debit\_amount 	| DECIMAL(18,2) 	| Debits/Bookings. 				|

| pre\_balance 		| DECIMAL(18,2) 	| previous balance				|

| cur\_balance 		| DECIMAL(18,2) 	| updated balance				|

| type 			| ENUM 		| TOPUP, BOOKING\_PAYMENT,      		|

| REFUND, CLOSURE\_PAYOUT, ADJUSTMENT. |

| reference\_id 		| STRING 		| Razorpay Payment ID or Booking Reference ID. |

| txn\_timestamp 	| TIMESTAMP 	| Combined Date/Hour 			|

| description 		| TEXT 		| Human-readable note. 			|

Note: When a wallet is closed, a CLOSURE\_PAYOUT entry is made to bring the balance to zero.

### **C. Table: topup\_requests**

Manages the lifecycle of a payment gateway request. 

| Column 		| Type 			| Description 					|

| id 			| UUID (PK) 		| Unique Request ID. 				|

| agent\_id 		| UUID (FK) 		|						|

| amount 		| DECIMAL(18,2) 	| Requested top-up amount. 			|

| pay\_order\_id 	| STRING 		| ID generated by Razorpay Order API 	|

| payment\_id 		| STRING 		| Razorpay Payment ID (after success)	|

| status 		| ENUM 		| PENDING, SUCCESS, FAILED. 	 	|

| created\_at 		| TIMESTAMP 	|						|

### **D. Table: refund\_requests**

Tracks the process of returning money upon wallet deletion/closure. 

| Column 		| Type 			| Description 					|

| id 			| UUID (PK) 		| Refund Request ID. 				|

| wallet\_id 		| UUID (FK) 		| 						|

| amount 		| DECIMAL(15,2) 	| Amount to be refunded. 			|

| status 		| ENUM 		| PENDING, COMPLETED, FAILED.		|

| remarks 		| TEXT 		| Admin notes \- reason for closure. 		|

| created\_at 		| TIMESTAMP 	| Date/Time of request. 			|

| updated\_at 		| TIMESTAMP 	| Date/Time when balance was actually updated. |

---

## **3\. API Specifications**

### **API 1: Wallet Initialization**

* Endpoint: POST /api/wallet/create  
  * Logic: Checks if a wallet exists for the agent\_id. if not, create one with balance: 0 and credit\_limit: 0\.

  **Request Body:**

  {

  "agent\_id": "UUID",

  "bank\_info": {

    "bank\_name": "HDFC Bank",

    "account\_holder": "Jibin Joseph",

    "account\_number": "50100012345678",

    "ifsc\_code": "HDFC0001234"

  }

  }

### **API 2: Top-Up Flow** 

* Endpoint: POST /api/wallet/topup/initiate: \* Generates a Razorpay order\_id.  
  * Creates a topup\_requests entry as PENDING.  
* Endpoint: POST /api/wallet/topup/verify:  
  * Validates Razorpay signature.  
  * Updates topup\_requests to SUCCESS.  
  * Note: Balance will update once get the success message from payment gate way.

### **API 3: Booking & Payments**

* Endpoint: POST /api/wallet/pay-booking:  
  * Validation: (balance) \>= booking\_amount (payable amount based on selected payment options).  
  * Action: Records a debit entry in wallet\_transactions and updates wallets.balance. The api has to be used after initializing the booking and before confirmation.

### **API 4: Get Wallet balance Info.**

* Endpoint: POST /api/wallet/balance  
  * Query Params:agent-id.  
  * Returns: balance, status.

### **API 5: Get Wallet History** 

* Endpoint: POST /api/wallet/history  
  * Query Params: page, limit, start\_date, end\_date.  
  * Returns: List of transactions from wallet\_transactions.

### **API 6: Refund Action API Specification**

* Endpoint: POST /api/wallet/refund   
  * Access: Internal System / Admin (Usually triggered by the Booking Cancellation Service) refund policy will be given later

### **API 7: Wallet Deletion / Closure API**

* Endpoint: POST /api/wallet/closure  
* Logic:  
  1. Check if the balance is negative (Agent owes money). If yes, reject closure until settled.  
  2. If the balance is positive, calculate Final Refund Amount.  
  3. Create a CLOSURE\_PAYOUT transaction (Debit) to make the balance 0.00.  
  4. Set status to CLOSED.  
  5. Admin Task: Admin uses the stored bank details to transfer the remaining funds manually or via Payout API.

---

## **4\. Business Logic flow & Calculations**

### **1\. Wallet Initialization**

Goal: Create a secure account and store payout destination details.

1. Trigger: Agent signs up or first accesses the wallet module in Angular.  
2. Input: agent\_id, bank\_name, account\_number, account\_holder, ifsc\_code.  
3. Backend Logic:  
   * Check if the wallets table already has a record for agent\_id.  
   * Validate Bank Details format (IFSC pattern, Account number length).  
   * Action: Insert new row in wallets with balance \= 0.00 and status \= ACTIVE / PENDING.

### **2\. Automatic Top-Up Flow (Razorpay)**

Goal: Instant balance update without human intervention.

1. Initiate: Agent enters amount X.  
2. Backend: Create Razorpay Order \> Save to topup\_requests as PENDING.  
3. Payment: Agent completes payment via Razorpay SDK in Angular.  
4. Verification: Razorpay returns payment\_id, order\_id, and signature.  
5. Backend Transaction (Atomic):  
   * Verify the Razorpay signature.  
   * Lock the specific wallet row (FOR UPDATE).  
   * Update topup\_requests to SUCCESS.  
   * Add X to wallets.balance.  
   * Create wallet\_transactions entry (type: TOPUP).  
   * Commit.

### **3\. Booking Payment Flow**

Goal: Prevent double-spending and ensure enough funds exist.

1. Trigger: Agent clicks "Pay via Wallet" for a booking.  
2. Backend Logic (Atomic):  
   * Lock the wallet row (FOR UPDATE).  
   * Check 1: Is status \== 'ACTIVE'? (If blocked, reject).  
   * Check 2: Is balance \>= booking\_amount? (If less, reject).  
   * Update wallets.balance \= balance \- booking\_amount.  
   * Create wallet\_transactions entry (type: BOOKING\_PAYMENT).  
   * Update Booking status to PAID.  
   * Commit.

### **4\. Booking Refund Flow (Cancellation)**

Goal: Automate returns for failed or cancelled rides.

1. Trigger: Booking status changes to CANCELLED.  
2. Backend Logic (Atomic):  
   * Identify original BOOKING\_PAYMENT in wallet\_transactions.  
   * Lock the wallet row.  
   * Update wallets.balance \= balance \+ refund\_amount.  
   * Create wallet\_transactions entry (type: BOOKING\_REFUND).  
   * Commit.  
3. Result: Balance increases instantly; transaction shows in agent history.

### **5\. Wallet Closure & Payout Flow (Exit)**

Goal: Formalized process for an agent to leave the platform and get their money back.

1. Trigger: Request to delete/close wallet.  
2. Backend Logic (Step 1 \- Account Closure):  
   * Lock the wallet row.  
   * Capture current\_balance.  
   * Create an entry in refund\_requests (status: PENDING, amount: current\_balance).  
   * Insert wallet\_transactions entry (negative amount to bring balance to 0.00).  
   * Set wallets.status \= 'CLOSED'.  
   * Commit.  
3. Admin Action (Step 2 \- Manual Transfer):  
   * Admin views the refund\_requests dashboard.  
   * Admin extracts the Bank Details from the wallets table.  
   * Admin performs a manual bank transfer (NEFT/IMPS).

### **Transaction Safety (Backend)**

To prevent "Double Spending" (where an agent clicks a button twice rapidly), all payment APIs must use **Database Transactions** with a **Row Lock**:

SQL  
\-- Step 1: Lock the wallet row  
SELECT balance, status FROM wallets   
WHERE agent\_id \= 'XYZ' AND status \= 'ACTIVE' FOR UPDATE;

\-- Step 2: Validate and Update inside the same transaction  
UPDATE wallets SET balance \= balance \- 500 WHERE agent\_id \= 'XYZ';  
INSERT INTO wallet\_transactions (...);

---

## **5\. Admin Dashboard Requirements (Backend Support)**

1. Agent Overview: Query to return a list of all agents, their current balance and status.  
2. View all the topup requests and can verify the status: note \- Admin approval is not necessary to increment the wallet balance. The balance will be updated automatically once the top-up request payment is completed.  
3. Security Controls: Endpoint to toggle status to BLOCKED with a mandatory block\_reason string.  
4. Audit Trail: Query to fetch wallet\_transactions filtered by txn\_timestamp for specific date/hour ranges.

---

## **6\. Implementation Notes for Backend**

* Razorpay Webhooks: Implement a webhook listener to handle cases where an agent closes the browser before the verify API is called.  
* All the api call payload should be secure.  
* Have to create a cron job to validate every one hour transaction and notify through mail if any unusual transaction is identified.

**7\. Frontend Calculation Logic for booking payment options.**

We have to consider 3 options to select before making payment.  
**Option 1**: 25% pay by agent at the time of booking, remaining payment will be collected by driver.  
	  
The agent pays 25% of the booking from the wallet, and the rest is handled by the driver.

* Wallet Deduction: 25% of the booking amount (Deducted immediately).  
* Driver Collection: 75% of the booking amount by (Agent/Customer pays the driver in cash at the end of the trip).  
* Timeline: One-time wallet deduction at the time of booking.

**Option 2**: 25% pay by agent at the time of booking, and 75% pay by agent before 48 hrs from trip start and remaining collected by Driver(Toll / Parking)  
	**Scenario A**: Booking is made MORE than 48 hours before the trip

* Pay Now: 25% from the wallet.  
* Pay Later: Remaining 75% is automatically deducted 48 hours before the trip starts.


	**Scenario B:** Booking is made LESS than 48 hours before the trip

* **Pay Now:** **100%** from the wallet immediately.

**Option 3**:  Full payment by Agent.

* **Scenario A**: Booking is made MORE than 48 hours before the trip  
  * Pay Now: 25% from the wallet.  
  * Pay Later: Remaining 95% is automatically deducted 48 hours before the trip starts. (Totaling 120%).  
* **Scenario B**: Booking is made LESS than 48 hours before the trip  
  * Pay Now: 120% from the wallet immediately.

The Adjustment Rule for Option 3: After the trip is completed, the admin enters the actual cost of tolls/parking.

*Example:* If the 20% buffer was rs 20 and the actual tolls were rs 15, the system will refund rs 5 back to the agent's wallet.

	

# Task division and time line

### **Project Phases Overview**

| Phase | Module | Owner | Estimated Timeline |
| :---- | :---- | :---- | :---- |
| Phase 1 | DB Design & Setup | Backend Team | 2 Days |
| Phase 2 | Wallet Core APIs | Backend Team | 2 Days |
| Phase 3 | Razorpay Integration | Backend Team | 3 Days |
| Phase 4 | Booking Payment Logic (All 3 Options) | Backend \+ Frontend | 5 Days |
| Phase 5 | Refund & Closure Flow | Backend Team | 3 Days |
| Phase 6 | Admin Dashboard APIs | Backend Team | 3 Days |
| Phase 7 | Frontend Wallet Module | Frontend Team | 5 Days |
| Phase 8 | Security, Webhooks & Cron Jobs | Backend Team | 3 Days |
| Phase 9 | Testing & UAT | QA \+ Backend \+ Frontend | 5 Days |

### **Detailed Task Breakdown**

### 

# **Phase 1: Database Design & Setup**

### **Goal: Create all required wallet-related tables**

### **Tasks**

| Task | Description | Owner | Timeline |
| :---- | :---- | :---- | :---- |
| Create wallets table | With constraints (balance \>= 0, status ENUM) | Backend Dev | Day 1 |
| Create wallet\_transactions table | Immutable ledger-based design | Backend Dev | Day 1 |
| Create topup\_requests table | Razorpay lifecycle tracking | Backend Dev | Day 2 |
| Create refund\_requests table | Closure refund tracking | Backend Dev | Day 2 |
| Add indexes & FK constraints | Performance \+ integrity | Backend Dev | Day 2 |

# **Phase 2: Wallet Core APIs**

### **APIs:**

* `/api/wallet/create`

* `/api/wallet/balance`

* `/api/wallet/history`

| Task | Description | Owner | Timeline |
| :---- | :---- | :---- | :---- |
| Wallet Initialization API | Create wallet \+ validate bank details | Backend Dev | Day 3 |
| Wallet Balance API | Return balance \+ status | Backend Dev | Day 3 |
| Wallet History API | Pagination \+ date filter | Backend Dev | Day 4 |
| Status Validation Logic | ACTIVE / BLOCKED check | Backend Dev | Day 4 |

# **Phase 3: Razorpay Top-up Flow**

Integration with Razorpay

| Task | Description | Owner | Timeline |
| :---- | :---- | :---- | :---- |
| Create Topup Initiate API | Generate order\_id | Backend Dev | Day 5 |
| Integrate Razorpay SDK | Angular integration | Frontend Dev | Day 6 |
| Verify API | Signature validation | Backend Dev | Day 6 |
| Atomic balance update logic | Row locking (FOR UPDATE) | Backend Dev | Day 7 |
| Webhook Listener | Handle missed verify calls | Backend Dev | Day 7 |

Note: Admin approval is **NOT required** for wallet increment. Balance auto-updates after successful payment verification.

# **Phase 4: Booking Payment Logic (3 Options)**

### **Critical & Complex Phase**

| Task | Description | Owner | Timeline |
| :---- | :---- | :---- | :---- |
| Wallet Locking Logic | Prevent double spending | Backend Dev | Day 8 |
| Option 1 (25% Pay) | Immediate 25% deduction | Backend Dev | Day 8 |
| Option 2 Logic | 25% now \+ 75% auto deduct | Backend Dev | Day 9 |
| 48-Hour Deduction Scheduler | Cron-based deduction | Backend Dev | Day 10 |
| Option 3 Logic | 120% buffer handling | Backend Dev | Day 11 |
| Toll Adjustment Logic | Refund excess buffer | Backend Dev | Day 11 |
| Frontend Payment Option UI | Option selector \+ calculation | Frontend Dev | Day 12 |

**Phase 5: Booking Refund Flow**

| Task | Description | Owner | Timeline |
| :---- | :---- | :---- | :---- |
| Detect CANCELLED booking | Event trigger integration | Backend Dev | Day 13 |
| Reverse wallet entry | BOOKING\_REFUND entry | Backend Dev | Day 13 |
| Atomic balance increment | Row lock \+ update | Backend Dev | Day 14 |

**Phase 6: Wallet Closure & Refund**

| Task | Description | Owner | Timeline |
| :---- | :---- | :---- | :---- |
| Closure API | Balance validation | Backend Dev | Day 15 |
| Create refund\_requests entry | Status PENDING | Backend Dev | Day 15 |
| Create CLOSURE\_PAYOUT transaction | Balance → 0 | Backend Dev | Day 16 |
| Admin Dashboard view | Refund request list | Backend Dev | Day 16 |
| Manual Transfer Process SOP | Ops/Admin Team | Day 17 |  |

**Phase 7: Admin Dashboard APIs**

| Task | Description | Owner | Timeline |
| :---- | :---- | :---- | :---- |
| Agent Overview API | Balance \+ status list | Backend Dev | Day 18 |
| Top-up Request View API | Status tracking | Backend Dev | Day 18 |
| Block Wallet API | Mandatory block\_reason | Backend Dev | Day 19 |
| Audit Trail API | Filter by txn\_timestamp | Backend Dev | Day 19 |

**Phase 8: Security & Monitoring**

| Task | Description | Owner | Timeline |
| :---- | :---- | :---- | :---- |
| Secure API payload validation | Input sanitization | Backend Dev | Day 20 |
| DB Transaction Enforcement | All payment APIs | Backend Dev | Day 21 |
| Hourly Transaction Validation Cron | Detect unusual activity | Backend Dev | Day 22 |
| Email Notification Integration | Alert system | Backend Dev | Day 22 |

**Phase 9: Testing & UAT**

| Task | Description | Owner | Timeline |
| :---- | :---- | :---- | :---- |
| Unit Testing | All APIs | Backend Dev | Day 23 |
| Payment Flow Testing | All 3 options | QA | Day 24 |
| Double Click Testing | Concurrency validation | QA | Day 24 |
| Refund & Closure Testing | End-to-end | QA | Day 25 |
| UAT Signoff | Stakeholders | Day 26–28 |  |

# Tab 8

