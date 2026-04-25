const payload = {
    pipelineId: Number("29"),
    stageId: Number("104"),
    number: String("5511999999999"),
    contactName: String("Cliente Teste"),
    name: `Oportunidade - Cliente Teste`,
    value: Number("0"),
    status: "open"
};
console.log(JSON.stringify(payload, null, 2));
