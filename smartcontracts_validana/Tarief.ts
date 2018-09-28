import { Contract, InitQuery, CodeQuery, TemplateFieldType, Template, addr } from "../../contract";
import { Entiteit, WerkSector } from "./interfaces";

interface TariefTemplate {
	jaar: number;
	sector: string;
	uurTarief: number;
}

export default class TariefContract extends Contract<TariefTemplate> {
	public type: string = "Tarief";
	public version: string = "1.0";
	public description: string = "Duo past tarief voor subsidie aan.";

	public template: Template<TariefTemplate> = {
		jaar: { type: TemplateFieldType.uint, desc: "Het jaar waarvoor dit tarief geldt.", name: "Jaar" },
		sector: { type: TemplateFieldType.str, desc: "Voor welke sector het geldt.", name: "Sector" },
		uurTarief: { type: TemplateFieldType.float, desc: "Tarfief wat geldt voor deze sector.", name: "Uur tarief" }
	};

	public async init(from: addr, block: number, processor: addr, previousBlockTimestamp: number,
		previousBlockHash: string, query: InitQuery): Promise<void> {

		await query("CREATE", "tarief", "(jaar INT, sector VARCHAR(32), tarief_centen BIGINT NOT NULL, PRIMARY KEY (jaar, sector));", []);
	}

	public async code(payload: TariefTemplate, from: addr, block: number, processor: addr, previousBlockTimestamp: number,
		previousBlockHash: string, query: CodeQuery): Promise<"OK" | string | void> {

		if (payload.jaar > 2147483647) {
			return "Ongeldig jaar.";
		}
		const uurTariefCenten = Math.round(payload.uurTarief * 100);
		if (uurTariefCenten < 0 || uurTariefCenten === Infinity) {
			return "Ongeldige tarief";
		}

		const sector: WerkSector = payload.sector as WerkSector;
		if (sector !== "VO" && sector !== "BVE" && sector !== "HBO" && sector !== "PO" && sector !== "PSO" && sector !== "VSO") {
			return "Ongeldige sector";
		}

		//Alleen duo mag tarief aanpassen
		const duo: Entiteit | undefined = (await query("SELECT", "entiteiten", "WHERE id = 'DUO';", [])).rows[0];
		if (duo === undefined || from !== duo.address) {
			return "Ongeldige gebruiker";
		}

		//Tarief toevoegen of aanpassen (aanpassingen gelden alleen voor nieuwe aanvragen)
		await query("INSERT", "tarief", "(jaar, sector, tarief_centen) VALUES ($1, $2, $3) ON CONFLICT ON CONSTRAINT tarief_pkey " +
			"DO UPDATE SET tarief_centen = $3;", [payload.jaar, sector, uurTariefCenten]);

		return "OK";
	}
}