import { Contract, InitQuery, CodeQuery, TemplateFieldType, Template, addr } from "../../contract";
import { SchoolEigenschappen, School, Entiteit } from "./interfaces";

interface SchoolTemplate {
	school: addr;
	eigenschappen: string;
}

export default class AddSchoolContract extends Contract<SchoolTemplate> {
	public type: string = "SchoolAanpassen";
	public version: string = "1.0";
	public description: string = "Duo past de eigenschappen van een school aan.";

	public template: Template<SchoolTemplate> = {
		school: { type: TemplateFieldType.addr, desc: "De school om aan te passen.", name: "School" },
		eigenschappen: { type: TemplateFieldType.json, desc: "Aanpassingen.", name: "Aanpassingen" }
	};

	public async init(from: addr, block: number, processor: addr, previousBlockTimestamp: number,
		previousBlockHash: string, query: InitQuery): Promise<void> {

	}

	public async code(payload: SchoolTemplate, from: addr, block: number, processor: addr, previousBlockTimestamp: number,
		previousBlockHash: string, query: CodeQuery): Promise<"OK" | string | void> {

		//Alleen duo mag een school aanpassen
		const duo: Entiteit | undefined = (await query("SELECT", "entiteiten", "WHERE id = 'DUO';", [])).rows[0];
		if (duo === undefined || from !== duo.address) {
			return "Ongeldige gebruiker";
		}

		//Huidige eigenschappen
		const school: School | undefined = (await query("SELECT", "scholen", "WHERE id = $1;", [payload.school])).rows[0];
		if (school === undefined) {
			return "School bestaat niet.";
		}

		//Nieuwe eigenschappen
		const newSettings: SchoolEigenschappen = JSON.parse(payload.eigenschappen);
		if (typeof newSettings !== "object" || newSettings === null) {
			return "Ongeldige eigenschappen";
		}

		//Kijk of aangepaste eigenschappen geldig zijn
		for (const key of Object.keys(newSettings) as Array<keyof SchoolEigenschappen>) {
			switch (key) {
				//UC1.R1
				case "bekostigdeOnderwijsinstelling": //B002.BR08.1
				case "orthopedagogischDidactischeCentrum": //B002.BR08.2
					if (typeof newSettings[key] !== "boolean") {
						return "Ongeldige eigenschappen";
					}
					break;
				default:
					return "Ongeldige eigenschappen";
			}
		}

		//Eigenschappen updaten
		Object.assign(school.eigenschappen, newSettings);

		//Kijk of die nu (niet) voldoed
		let laatstVoldeed = school.laatst_voldeed;
		let laatstNietVoldeed = school.laatst_niet_voldeed;

		if (school.eigenschappen.bekostigdeOnderwijsinstelling === true ||  //B002.BR08.1
			school.eigenschappen.orthopedagogischDidactischeCentrum === true) { //B002.BR08.2
			laatstVoldeed = previousBlockTimestamp; //Voldoet nu, dus laatst voldeed updaten
		} else {
			laatstNietVoldeed = previousBlockTimestamp; //Voldoet nu niet, dus laatst niet voldeed updaten
		}

		await query("UPDATE", "scholen", "SET eigenschappen = $2, laatst_voldeed = $3, laatst_niet_voldeed = $4 WHERE id = $1;",
			[payload.school, JSON.stringify(school.eigenschappen), laatstVoldeed, laatstNietVoldeed]);

		return "OK";
	}
}