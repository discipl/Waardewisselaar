import { Contract, InitQuery, CodeQuery, TemplateFieldType, Template, addr } from "../../contract";
import { Entiteit, BudgetSector, Budget } from "./interfaces";

interface BudgetTemplate {
	jaar: number;
	sector: string;
	budgetTotaal: number;
	budgetVervolg: number;
}

export default class BudgetContract extends Contract<BudgetTemplate> {
	public type: string = "Budget";
	public version: string = "1.0";
	public description: string = "Duo past budget voor subsidie aan.";

	public template: Template<BudgetTemplate> = {
		jaar: { type: TemplateFieldType.uint, desc: "Het jaar waarvoor budget beschikbaar is.", name: "Jaar" },
		sector: { type: TemplateFieldType.str, desc: "Voor welke sector het beschikbaar is.", name: "Sector" },
		budgetTotaal: { type: TemplateFieldType.float, desc: "Budget wat er totaal beschikbaar is voor deze sector.", name: "Budget totaal" },
		budgetVervolg: { type: TemplateFieldType.float, desc: "Welk gedeelte van dit budget voor vervolg aanvragen is.", name: "Budget vervolg" }
	};

	public async init(from: addr, block: number, processor: addr, previousBlockTimestamp: number,
		previousBlockHash: string, query: InitQuery): Promise<void> {

		await query("CREATE", "budget", "(jaar INT, sector VARCHAR(32), beschikbaar_totaal_centen BIGINT NOT NULL, " +
			"beschikbaar_vervolg_centen BIGINT NOT NULL, uitgegeven_totaal_centen BIGINT NOT NULL DEFAULT 0, " +
			"uitgegeven_vervolg_centen BIGINT NOT NULL DEFAULT 0, PRIMARY KEY (jaar, sector));", []);
	}

	public async code(payload: BudgetTemplate, from: addr, block: number, processor: addr, previousBlockTimestamp: number,
		previousBlockHash: string, query: CodeQuery): Promise<"OK" | string | void> {

		if (payload.jaar > 2147483647) {
			return "Ongeldig jaar.";
		}
		const nieuwTotaalCenten = Math.round(payload.budgetTotaal * 100);
		const nieuwVervolgCenten = Math.round(payload.budgetVervolg * 100);
		if (nieuwTotaalCenten < 0 || nieuwVervolgCenten < 0 || nieuwTotaalCenten === Infinity || nieuwVervolgCenten === Infinity ||
			nieuwTotaalCenten < nieuwVervolgCenten) {
			return "Ongeldige budget";
		}

		const sector: BudgetSector = payload.sector as BudgetSector;
		if (sector !== "VO" && sector !== "BVE" && sector !== "HBO" && sector !== "POenPSOenVSO") {
			return "Ongeldige sector";
		}

		//Alleen duo mag budget aanpassen
		const duo: Entiteit | undefined = (await query("SELECT", "entiteiten", "WHERE id = 'DUO';", [])).rows[0];
		if (duo === undefined || from !== duo.address) {
			return "Ongeldige gebruiker";
		}

		const huidigBudget: Budget = (await query("SELECT", "budget", "WHERE jaar = $1 AND sector = $2;", [payload.jaar, sector])).rows[0];

		if (huidigBudget !== undefined) {
			const totaalVerandering = nieuwTotaalCenten - huidigBudget.beschikbaar_totaal_centen;
			const vervolgVerandering = nieuwVervolgCenten - huidigBudget.beschikbaar_vervolg_centen;

			//Als budget verlaagt kijk of er nog genoeg beschikbaar zal zijn
			if (huidigBudget.beschikbaar_totaal_centen - totaalVerandering < 0) {
				return "Alreeds teveel uitgegeven, kan totaal budget nog verlagen tot €" +
					(huidigBudget.beschikbaar_totaal_centen - huidigBudget.uitgegeven_totaal_centen) / 100;
			}
			if (huidigBudget.beschikbaar_vervolg_centen - vervolgVerandering < 0) {
				return "Alreeds teveel uitgegeven, kan vervolg budget nog verlagen tot €" +
					(huidigBudget.beschikbaar_vervolg_centen - huidigBudget.uitgegeven_vervolg_centen) / 100;
			}

			//Budget ophogen
			await query("UPDATE", "budget", "SET beschikbaar_totaal_centen = $3, beschikbaar_vervolg_centen = $4 " +
				"WHERE jaar = $1 AND sector = $2;", [payload.jaar, sector, nieuwTotaalCenten, nieuwVervolgCenten]);
		} else {
			//Nieuw budget toevoegen
			await query("INSERT", "budget", "(jaar, sector, beschikbaar_totaal_centen, beschikbaar_vervolg_centen) VALUES ($1, $2, $3, $4);",
				[payload.jaar, sector, nieuwTotaalCenten, nieuwVervolgCenten]);
		}

		return "OK";
	}
}