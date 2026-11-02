import sys
from datetime import date, timedelta
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.formatting.rule import FormulaRule
from openpyxl.utils import get_column_letter

ORANGE="FF7A00"; SOFT="FFF1E4"; INK="161616"
hdr_font=Font(bold=True,color="FFFFFF",name="Calibri",size=11)
hdr_fill=PatternFill("solid",fgColor=INK)
thin=Side(style="thin",color="E5E5E5")
wb=Workbook()

# ---- Invoices ----
ws=wb.active; ws.title="Invoices"
ws["A1"]="Paid On Time · Invoice Tracker"; ws["A1"].font=Font(bold=True,size=18,color=ORANGE)
ws["A2"]="Fill in the white columns. The grey columns work themselves out. Type Yes in 'Paid?' when the money lands."
ws["A2"].font=Font(italic=True,color="666666")
cols=["Client","Email / phone","Invoice #","What for","Amount","Date sent","Due date","Paid?","Date paid",
      "Days overdue","Status","Send this reminder","Last reminder sent"]
widths=[20,24,12,20,12,13,13,9,13,13,18,30,18]
HR=4
for i,(c,w) in enumerate(zip(cols,widths),1):
    cell=ws.cell(HR,i,c); cell.font=hdr_font; cell.fill=hdr_fill; cell.alignment=Alignment(vertical="center",wrap_text=True)
    ws.column_dimensions[get_column_letter(i)].width=w
ws.row_dimensions[HR].height=30
FIRST,LAST=HR+1,HR+300
today=date.today()
samples=[("Example: Ali Ahmed","ali@acme.com","INV-001","Logo design",450,today-timedelta(40),today-timedelta(16),"No",None),
         ("Example: Maria Lopez","+15551234567","INV-002","Website copy",1200,today-timedelta(20),today-timedelta(8),"Yes",today-timedelta(1)),
         ("Example: Tom Reed","tom@reed.co","INV-003","Social posts",300,today-timedelta(10),today+timedelta(2),"No",None)]
grey=PatternFill("solid",fgColor="F3F3F3")
for r in range(FIRST,LAST+1):
    if r-FIRST < len(samples):
        for j,v in enumerate(samples[r-FIRST],1):
            if v is not None: ws.cell(r,j,v)
    ws.cell(r,5).number_format='#,##0.00'
    for c in (6,7,9,13): ws.cell(r,c).number_format='dd mmm yyyy'
    ws.cell(r,10,f'=IF(OR(G{r}="",H{r}="Yes"),"",MAX(0,TODAY()-G{r}))')
    ws.cell(r,11,f'=IF(A{r}="","",IF(H{r}="Yes","Paid",IF(TODAY()>G{r},"Overdue",IF(G{r}-TODAY()<=3,"Due soon","Not due yet"))))')
    ws.cell(r,12,(f'=IF(OR(A{r}="",H{r}="Yes"),"",IF(TODAY()-G{r}>=30,"6 · Pause work",IF(TODAY()-G{r}>=14,"5 · Final notice",'
                  f'IF(TODAY()-G{r}>=7,"4 · Firm reminder",IF(TODAY()-G{r}>=3,"3 · Friendly nudge",IF(TODAY()-G{r}>=0,"2 · Due today",'
                  f'IF(TODAY()-G{r}>=-3,"1 · Heads-up","Nothing yet")))))))'))
    for c in (10,11,12): ws.cell(r,c).fill=grey
    for c in range(1,14): ws.cell(r,c).border=Border(bottom=thin)
dv=DataValidation(type="list",formula1='"Yes,No"',allow_blank=True); ws.add_data_validation(dv); dv.add(f"H{FIRST}:H{LAST}")
rng=f"A{FIRST}:M{LAST}"
ws.conditional_formatting.add(rng,FormulaRule(formula=[f'$K{FIRST}="Overdue"'],fill=PatternFill("solid",fgColor="FDECEA"),font=Font(color="B42318")))
ws.conditional_formatting.add(rng,FormulaRule(formula=[f'$K{FIRST}="Due soon"'],fill=PatternFill("solid",fgColor="FEF3E2")))
ws.conditional_formatting.add(rng,FormulaRule(formula=[f'$K{FIRST}="Paid"'],font=Font(color="067647")))
ws.freeze_panes=f"B{FIRST}"
ws.auto_filter.ref=f"A{HR}:M{LAST}"

# ---- Dashboard ----
d=wb.create_sheet("Dashboard",0)
d.column_dimensions["A"].width=34; d.column_dimensions["B"].width=18
d["A1"]="Paid On Time · Dashboard"; d["A1"].font=Font(bold=True,size=18,color=ORANGE)
d["A2"]="Updates automatically from the Invoices tab."; d["A2"].font=Font(italic=True,color="666666")
R=f"Invoices!$E${FIRST}:$E${LAST}"; H=f"Invoices!$H${FIRST}:$H${LAST}"; K=f"Invoices!$K${FIRST}:$K${LAST}"
I=f"Invoices!$I${FIRST}:$I${LAST}"; L=f"Invoices!$L${FIRST}:$L${LAST}"; F=f"Invoices!$F${FIRST}:$F${LAST}"
rows=[("Total outstanding",f'=SUMIFS({R},{H},"<>Yes")','#,##0.00'),
      ("Overdue",f'=SUMIFS({R},{K},"Overdue")','#,##0.00'),
      ("Number of overdue invoices",f'=COUNTIF({K},"Overdue")','0'),
      ("Paid this month",f'=SUMIFS({R},{H},"Yes",{I},">="&DATE(YEAR(TODAY()),MONTH(TODAY()),1))','#,##0.00'),
      ("Reminders to send today",f'=COUNTA({L})-COUNTBLANK({L})-COUNTIF({L},"Nothing yet")','0'),
      ("Average days to get paid",f'=IFERROR(SUMPRODUCT(({H}="Yes")*({I}<>"")*({I}-{F}))/COUNTIFS({H},"Yes",{I},"<>"),"–")','0')]
for i,(lab,f,fmt) in enumerate(rows,4):
    a=d.cell(i,1,lab); a.font=Font(size=13)
    b=d.cell(i,2,f); b.font=Font(size=14,bold=True,color="B42318" if lab.startswith("Overdue") or lab.startswith("Number") else INK); b.number_format=fmt
    for c in (a,b): c.border=Border(bottom=thin)
d["A12"]="How to use"; d["A12"].font=Font(bold=True,size=13)
for i,t in enumerate(["1. Delete the 3 example rows on the Invoices tab.",
                      "2. Add a row every time you send an invoice.",
                      "3. Each morning, filter 'Send this reminder' and send those scripts (Reminder Scripts tab).",
                      "4. Write the date in 'Last reminder sent' so you don't double-send.",
                      "5. Type Yes in 'Paid?' and the date paid when the money arrives."],13):
    d.cell(i,1,t)

# ---- Scripts ----
s=wb.create_sheet("Reminder Scripts")
s.column_dimensions["A"].width=22; s.column_dimensions["B"].width=16; s.column_dimensions["C"].width=110
s["A1"]="Reminder scripts · replace the [brackets]"; s["A1"].font=Font(bold=True,size=16,color=ORANGE)
for j,h in enumerate(["Stage","When","Email"],1):
    c=s.cell(3,j,h); c.font=hdr_font; c.fill=hdr_fill
sys.path.insert(0, sys.argv[1]); from scripts import SCRIPTS
for i,sc in enumerate(SCRIPTS,4):
    s.cell(i,1,sc["stage"]).font=Font(bold=True)
    s.cell(i,2,sc["when"])
    s.cell(i,3,"Subject: "+sc["subject"]+"\n\n"+sc["email"]+"\n\n— Short WhatsApp/DM version —\n"+sc["chat"])
    s.cell(i,3).alignment=Alignment(wrap_text=True,vertical="top")
    for c in (1,2): s.cell(i,c).alignment=Alignment(vertical="top",wrap_text=True)
    s.row_dimensions[i].height=max(150, 15*(s.cell(i,3).value.count("\n")+3))
wb.save(sys.argv[2])
print("saved")
