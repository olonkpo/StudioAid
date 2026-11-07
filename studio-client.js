(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./studio-operations'));else root.StudioClient=factory(root.StudioOperations);})(typeof globalThis!=='undefined'?globalThis:this,function(Operations){
 'use strict';
 function previewResponse(project,input){
  const value=typeof input==='string'?JSON.parse(input):input;
  if(!value||value.app!=='StudioAidClientResponse'||value.version!==1)throw new Error('Choose a StudioAid client response file.');
  if(!project.clientOffer||value.offerId!==project.clientOffer.offerId||String(value.projectId)!==String(project.id))throw new Error('This response does not match the latest offer for this project.');
  if(!['approved','declined','details'].includes(value.status))throw new Error('The client response status is invalid.');
  const submitted=Date.parse(value.submittedAt);if(!Number.isFinite(submitted)||submitted<Date.parse(project.clientOffer.createdAt)||submitted>Date.parse(project.clientOffer.expiresAt))throw new Error('The response date is outside the offer period.');
  if(!value.response||typeof value.response!=='object'||Array.isArray(value.response))throw new Error('The response details are missing.');
  const response={};for(const key of ['name','email','phone','location','brief','preferences']){const text=value.response[key]===undefined?'':value.response[key];if(typeof text!=='string'||text.length>20000)throw new Error('Invalid client '+key+'.');response[key]=text;}
  return{app:'StudioAidClientResponse',version:1,offerId:value.offerId,projectId:String(value.projectId),status:value.status,submittedAt:new Date(submitted).toISOString(),response};
 }
 function offerMatches(project,defaults,currency){
  const previous=project.clientOffer;if(!previous)return false;
  const current=Operations.createOffer(project,defaults,currency,{id:previous.offerId,createdAt:previous.createdAt,expiresAt:previous.expiresAt});
  const basis=offer=>JSON.stringify({business:offer.business,client:offer.client,shoot:offer.shoot,quote:offer.quote});
  return basis(previous)===basis(current);
 }
 function applyResponse(project,input,defaults,currency){
  const result=previewResponse(project,input);
  if(!offerMatches(project,defaults,currency))throw new Error('The project or quote changed after this offer was exported. Review it and send a new offer.');
  if((project.clientResponses||[]).some(x=>x.offerId===result.offerId))throw new Error('A response for this offer has already been applied.');
  project.clientResponses=[...(project.clientResponses||[]),result];
  const r=result.response;for(const [from,to]of [['name','client'],['email','email'],['phone','phone'],['location','location'],['brief','brief']])if(r[from].trim())project[to]=r[from];
  project.quoteApproval={status:result.status,submittedAt:result.submittedAt,offerId:result.offerId};
  return result;
 }
 return{previewResponse,offerMatches,applyResponse};
});
