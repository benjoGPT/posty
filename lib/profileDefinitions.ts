export interface ProfileMetric {id:string;title:string;group:string;unit:'%'|'number';period:string;source:string;note:string}
const census='https://www.ons.gov.uk/census';
export const PROFILE_METRICS:ProfileMetric[]=[
 {id:'population',title:'Population',group:'People',unit:'number',period:'Census 2021',source:census,note:'Usual residents counted in Census 2021.'},
 {id:'children',title:'Aged under 15',group:'People',unit:'%',period:'Census 2021',source:census,note:'Share of usual residents aged under 15.'},
 {id:'older',title:'Aged 65 or over',group:'People',unit:'%',period:'Census 2021',source:census,note:'Share of usual residents aged 65 or over.'},
 {id:'good_health',title:'Good or very good health',group:'Health',unit:'%',period:'Census 2021',source:census,note:'Self-reported general health.'},
 {id:'disabled',title:'Disabled under the Equality Act',group:'Health',unit:'%',period:'Census 2021',source:census,note:'People whose day-to-day activities are limited.'},
 {id:'employed',title:'In employment',group:'Work and skills',unit:'%',period:'Census 2021',source:census,note:'Share of residents aged 16 and over in employment.'},
 {id:'unemployed',title:'Unemployed',group:'Work and skills',unit:'%',period:'Census 2021',source:census,note:'Share of residents aged 16 and over recorded as unemployed.'},
 {id:'degree',title:'Level 4 qualification or above',group:'Work and skills',unit:'%',period:'Census 2021',source:census,note:'Degree-level or equivalent qualification.'},
 {id:'owned',title:'Owner occupied',group:'Homes',unit:'%',period:'Census 2021',source:census,note:'Households owned outright or with a mortgage or loan.'},
 {id:'private_rent',title:'Private rented',group:'Homes',unit:'%',period:'Census 2021',source:census,note:'Households renting privately or living rent free.'},
 {id:'social_rent',title:'Social rented',group:'Homes',unit:'%',period:'Census 2021',source:census,note:'Households renting from a council or social landlord.'},
 {id:'detached',title:'Detached homes',group:'Homes',unit:'%',period:'Census 2021',source:census,note:'Share of occupied household spaces that are detached.'},
 {id:'flats',title:'Flats and apartments',group:'Homes',unit:'%',period:'Census 2021',source:census,note:'Share of occupied household spaces in flats, maisonettes or apartments.'},
 {id:'no_car',title:'Households without a car or van',group:'Transport',unit:'%',period:'Census 2021',source:census,note:'Households with no cars or vans available.'},
 {id:'born_uk',title:'Born in the UK',group:'Identity',unit:'%',period:'Census 2021',source:census,note:'Share of usual residents born in the UK.'},
 {id:'no_religion',title:'No religion',group:'Identity',unit:'%',period:'Census 2021',source:census,note:'Voluntary census religion response.'},
];

export const PROFILE_PIES=[
 {title:'Age',items:[['Under 15','children'],['15 to 64','working_age'],['65+','older']]},
 {title:'Tenure',items:[['Owned','owned'],['Private rented','private_rent'],['Social rented','social_rent'],['Other','other_tenure']]},
] as const;
