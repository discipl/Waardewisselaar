import { Contract, InitQuery, CodeQuery, TemplateFieldType, Template, addr } from "../../contract";

interface BudgetTemplate {
	jaar: number;
	bedrag: number;
}

export default class BudgetContract extends Contract<BudgetTemplate> {
	public type: string = "MaxVergoedCollegegeld";
	public version: string = "1.0";
	public description: string = "Duo past maximum te vergoeden collegegeld aan.";

	public template: Template<BudgetTemplate> = {
		jaar: { type: TemplateFieldType.uint, desc: "Het jaar waarvoor dit maximum bedrag geldt.", name: "Jaar" },
		bedrag: { type: TemplateFieldType.float, desc: "Het bedrag.", name: "Bedrag" }
	};

	public async init(from: addr, block: number, processor: addr, previousBlockTimestamp: number,
		previousBlockHash: string, query: InitQuery): Promise<void> {

		await query("CREATE", "max_vergoed_collegegeld", "(jaar INT PRIMARY KEY, bedrag_centen INT NOT NULL);", []);
	}

	public async code(payload: BudgetTemplate, from: addr, block: number, processor: addr, previousBlockTimestamp: number,
		previousBlockHash: string, query: CodeQuery): Promise<"OK" | string | void> {

		if (payload.jaar > 2147483647) {
			return "Ongeldig jaar.";
		}
		const bedragCenten = Math.round(payload.bedrag * 100);
		if (bedragCenten < 0 || bedragCenten > 2147483647) {
			return "Ongeldige bedrag";
		}

		await query("INSERT", "max_vergoed_collegegeld", "(jaar, bedrag_centen) VALUES ($1, $2) ON CONFLICT ON CONSTRAINT " +
			"max_vergoed_collegegeld_pkey DO UPDATE SET bedrag_centen = $2;", [payload.jaar, bedragCenten]);

		return "OK";
	}
}