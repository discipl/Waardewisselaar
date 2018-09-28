import { addr } from "../../contract";

export interface Entiteit {
	id: addr;
	address: string;
}

export interface School {
	id: addr;
	eigenschappen: SchoolEigenschappen;
	laatst_voldeed: number | null;
	laatst_niet_voldeed: number;
}
export interface SchoolEigenschappen {
	bekostigdeOnderwijsinstelling?: boolean;
	orthopedagogischDidactischeCentrum?: boolean;
}

export interface Opleider {
	id: addr;
}

export interface Docent {
	id: addr;
	eigenschappen: DocentEigenschappen;
	werkgever: addr | null;
}
export interface DocentEigenschappen {
	verledenDienstverbanden?: Array<{
		eindDatum: number;
		werkgever: addr;
	}>;
	voldoetAanBevoegdheidseisen?: boolean;
	twintigProcentLesgebondenTaken?: boolean;
	pedagogischDidactischVerantwoordelijk?: boolean;
	ambulantBegeleider?: boolean;
	zorgcoördinator?: boolean;
	interneBegeleider?: boolean;
	remedialTeacher?: boolean;
	graadBachalorVoeren?: boolean;
	sector?: WerkSector;
	fte?: number;
}

export interface Opleiding {
	id: Buffer;
	eigenschappen: OpleidingEigenschappen;
	opleider: addr;
}
export interface OpleidingEigenschappen {
	bachelor?: boolean;
	master?: boolean;
	deficiëntieopleiding?: boolean;
	inNederland?: boolean;
	inEU?: boolean;
	inAruba?: boolean;
	inSintMaarten?: boolean;
	inCuraçao?: boolean;
	inEngland?: boolean;
	NufficGelijkwaardigVerklaardeBuitenlands?: boolean;
	NVOgeaccrediteerd?: boolean;
	EC?: number;
	collegeGeldCenten?: number;
	aanpassenStap?: 1 | 2; //undefined = nog niet aangepast, 1 = door school aangepast, 2 = door duo aangepast
}

export type Sector = "VO" | "BVE" | "HBO";
export type WerkSector = Sector | "PO" | "PSO" | "VSO";
export type BudgetSector = Sector | "POenPSOenVSO";

export interface Budget {
	jaar: string;
	sector: BudgetSector;
	beschikbaar_totaal_centen: number;
	beschikbaar_vervolg_centen: number;
	uitgegeven_totaal_centen: number;
	uitgegeven_vervolg_centen: number;
}

export interface Tarief {
	jaar: string;
	sector: WerkSector;
	tarief_centen: number;
}

export interface Subsidie {
	docent: addr;
	opleiding: Buffer;
	jaar: number;
	vervolg_aanvraag: boolean;
	aanvraag_tijd: number;
	geannuleerd: boolean;
	bedrag_centen: number;
	sector: WerkSector;
	studieverlof_aanvraagtijd: number | null;
	studieverlof_uren: number | null;
	studieverlof_bedragcenten: number | null;
}