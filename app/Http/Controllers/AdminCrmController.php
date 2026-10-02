<?php

namespace App\Http\Controllers;

use App\Services\AdminAccessService;
use App\Services\CrmService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use RuntimeException;

class AdminCrmController extends Controller
{
    public function __construct(
        private readonly AdminAccessService $access,
        private readonly CrmService $crm,
    ) {}

    public function panel()
    {
        return response()->file(public_path('admin/index.html'), [
            'Cache-Control'=>'no-cache, no-store, must-revalidate',
            'X-Robots-Tag'=>'noindex, nofollow',
        ]);
    }

    public function site(): JsonResponse
    {
        return response()->json([
            'site'=>$this->crm->getSiteInfo(),
            'testimonials'=>$this->crm->listTestimonials(),
        ]);
    }

    public function updateSite(Request $request): JsonResponse
    {
        $site=$this->crm->saveSiteSettings($request->all());
        $this->audit($this->admin($request),'site.update','site','1');
        return response()->json(['site'=>$site]);
    }

    public function createTestimonial(Request $request): JsonResponse
    {
        $created=$this->crm->addTestimonial($request->all());
        $this->audit(
            $this->admin($request),
            'testimonial.create',
            'testimonial',
            $created['id'],
            ['author'=>(string)$request->input('author','')]
        );
        return response()->json(['testimonials'=>$created['testimonials']],201);
    }

    public function removeTestimonial(Request $request,string $id)
    {
        $this->assertId($id);
        if (!$this->crm->removeTestimonial($id)) {
            return response()->json(['error'=>'NOT_FOUND'],404);
        }
        $this->audit($this->admin($request),'testimonial.remove','testimonial',$id);
        return response()->noContent();
    }

    public function leads(): JsonResponse
    {
        return response()->json(['leads'=>$this->crm->listLeads(100)]);
    }

    public function updateLead(Request $request,string $id): JsonResponse
    {
        $this->assertId($id);
        $status=(string)$request->input('status','');
        if (!$this->crm->updateLeadStatus($id,$status)) {
            return response()->json(['error'=>'NOT_FOUND'],404);
        }
        $this->audit($this->admin($request),'lead.status','lead',$id,['status'=>$status]);
        return response()->json(['ok'=>true]);
    }

    public function deleteLead(Request $request,string $id)
    {
        $this->assertId($id);
        if (!$this->crm->deleteLead($id)) {
            return response()->json(['error'=>'NOT_FOUND'],404);
        }
        $this->audit($this->admin($request),'lead.delete','lead',$id,[
            'reason'=>'privacy_or_admin_request',
        ]);
        return response()->noContent();
    }

    public function auditLog(Request $request): JsonResponse
    {
        $raw=$request->query('limit',100);
        if (!is_numeric($raw)) throw new RuntimeException('INVALID_LIMIT');
        $limit=(int)$raw;
        if ($limit<1 || $limit>250) throw new RuntimeException('INVALID_LIMIT');
        return response()->json(['audit'=>$this->crm->listAudit($limit)]);
    }

    public function team(Request $request): JsonResponse
    {
        $admin=$this->admin($request);
        return response()->json([
            'team'=>array_map(
                fn(array $member): array=>$this->crm->staffView($member,$admin,$this->access),
                $this->crm->listStaff()
            ),
        ]);
    }

    public function invitations(): JsonResponse
    {
        return response()->json(['invitations'=>$this->crm->listInvitations()]);
    }

    public function createInvitation(Request $request): JsonResponse
    {
        $admin=$this->admin($request);
        $email=$this->crm->email($request->input('email'),'INVALID_INVITATION');
        $name=trim((string)$request->input('name',''));
        $role=(string)$request->input('role','editor');

        if ($name==='' || mb_strlen($name)>255 || !in_array($role,['editor','manager'],true)) {
            throw new RuntimeException('INVALID_INVITATION');
        }

        $token=$this->token(32);
        $expiresAtMs=$this->nowMs()+CrmService::INVITATION_TTL_MS;
        $this->crm->createInvitation([
            'tokenHash'=>hash('sha256',$token),
            'email'=>$email,
            'name'=>$name,
            'role'=>$role,
            'invitedBy'=>$admin['email'],
            'expiresAtMs'=>$expiresAtMs,
        ]);

        $this->audit($admin,'team.invite','staff',$email,[
            'role'=>$role,
            'expiresAtMs'=>$expiresAtMs,
            'tokenStoredAsHash'=>true,
        ]);

        $origin=rtrim((string)config('app.admin_url'),'/');
        if ($origin==='') $origin=rtrim((string)config('app.url'),'/');

        return response()->json([
            'invitation'=>[
                'email'=>$email,
                'name'=>$name,
                'role'=>$role,
                'expiresAtMs'=>$expiresAtMs,
                'url'=>$origin.'/admin?invite='.rawurlencode($token),
            ],
        ],201);
    }

    public function revokeInvitation(Request $request,string $email)
    {
        $email=$this->crm->email(rawurldecode($email));
        $revoked=$this->crm->revokeInvitations($email);
        if ($revoked<1) return response()->json(['error'=>'NOT_FOUND'],404);

        $this->audit($this->admin($request),'team.invite.revoke','staff',$email,[
            'invitationsRevoked'=>$revoked,
        ]);
        return response()->noContent();
    }

    public function createTeamMember(Request $request): JsonResponse
    {
        $admin=$this->admin($request);
        $email=$this->crm->email($request->input('email'),'INVALID_TEAM_MEMBER');
        $code=(string)$request->input('pairingCode','');
        $name=trim((string)$request->input('name',''));
        $role=(string)$request->input('role','editor');

        if (
            !preg_match('/^[A-Za-z0-9_-]{12,64}$/',$code)
            || $name==='' || mb_strlen($name)>255
            || !in_array($role,['editor','manager'],true)
        ) {
            throw new RuntimeException('INVALID_TEAM_MEMBER');
        }

        $member=$this->crm->bindPairing(
            hash('sha256',$code),$email,$name,$role,$admin['email']
        );
        if (!$member) return response()->json(['error'=>'INVALID_PAIRING_CODE'],400);

        $this->audit($admin,'team.create','staff',$email,[
            'role'=>$member['role'],
            'active'=>(bool)$member['active'],
            'openIdBound'=>true,
        ]);

        return response()->json([
            'member'=>$this->crm->staffView($member,$admin,$this->access),
        ],201);
    }

    public function updateTeamMember(Request $request,string $email): JsonResponse
    {
        $admin=$this->admin($request);
        $email=$this->crm->email(rawurldecode($email));
        $current=$this->crm->findStaffByEmail($email);
        if (!$current) return response()->json(['error'=>'NOT_FOUND'],404);

        $body=$request->all();
        $allowed=['name','role','active'];
        if ($body===[] || array_diff(array_keys($body),$allowed)) {
            throw new RuntimeException('INVALID_TEAM_MEMBER');
        }

        $patch=[];
        if (array_key_exists('name',$body)) {
            $name=trim((string)$body['name']);
            if ($name==='' || mb_strlen($name)>255) throw new RuntimeException('INVALID_TEAM_MEMBER');
            $patch['name']=$name;
        }
        if (array_key_exists('role',$body)) {
            if (!in_array($body['role'],['editor','manager'],true)) {
                throw new RuntimeException('INVALID_TEAM_MEMBER');
            }
            $patch['role']=$body['role'];
        }
        if (array_key_exists('active',$body)) {
            if (!is_bool($body['active']) && !in_array($body['active'],[0,1,'0','1','true','false'],true)) {
                throw new RuntimeException('INVALID_TEAM_MEMBER');
            }
            $patch['active']=filter_var($body['active'],FILTER_VALIDATE_BOOL);
        }

        $targetOpenId=(string)($current['open_id']??'');
        $isSelf=$targetOpenId!=='' && hash_equals($targetOpenId,$admin['openId']);
        $isBootstrap=$this->access->isBootstrap($targetOpenId);

        if ($isSelf && (
            (isset($patch['role']) && $patch['role']!==$admin['role'])
            || (array_key_exists('active',$patch) && $patch['active']===false)
        )) {
            return response()->json(['error'=>'CANNOT_CHANGE_SELF_ACCESS'],400);
        }

        if ($isBootstrap && (
            (isset($patch['role']) && $patch['role']!=='manager')
            || (array_key_exists('active',$patch) && $patch['active']===false)
        )) {
            return response()->json(['error'=>'BOOTSTRAP_MANAGER_PROTECTED'],400);
        }

        $member=$this->crm->saveStaff([
            'email'=>$email,
            'openId'=>$targetOpenId,
            'name'=>$patch['name']??$current['name'],
            'role'=>$isBootstrap?'manager':($patch['role']??$current['role']),
            'active'=>$patch['active']??(bool)$current['active'],
            'invitedBy'=>$current['invited_by']?:$admin['email'],
        ]);

        if ($targetOpenId!=='') $this->access->revokeAll($targetOpenId);

        $this->audit($admin,'team.update','staff',$email,[
            'role'=>$member['role'],
            'active'=>(bool)$member['active'],
            'sessionsRevoked'=>true,
        ]);

        return response()->json([
            'member'=>$this->crm->staffView($member,$admin,$this->access),
        ]);
    }

    public function removeTeamMember(Request $request,string $email)
    {
        $admin=$this->admin($request);
        $email=$this->crm->email(rawurldecode($email));
        $current=$this->crm->findStaffByEmail($email);
        if (!$current) return response()->json(['error'=>'NOT_FOUND'],404);

        $openId=(string)($current['open_id']??'');
        if ($openId!=='' && hash_equals($openId,$admin['openId'])) {
            return response()->json(['error'=>'CANNOT_REMOVE_SELF'],400);
        }
        if ($this->access->isBootstrap($openId)) {
            return response()->json(['error'=>'BOOTSTRAP_MANAGER_PROTECTED'],400);
        }

        if (!$this->crm->removeStaff($email)) {
            return response()->json(['error'=>'NOT_FOUND'],404);
        }
        if ($openId!=='') $this->access->revokeAll($openId);

        $this->audit($admin,'team.remove','staff',$email,['sessionsRevoked'=>true]);
        return response()->noContent();
    }

    private function admin(Request $request): array
    {
        $admin=$request->attributes->get('admin');
        if (!is_array($admin)) throw new RuntimeException('AUTH_REQUIRED');
        return $admin;
    }

    private function audit(array $admin,string $action,string $type,?string $id=null,?array $details=null): void
    {
        try { $this->crm->recordAudit($admin,$action,$type,$id,$details); }
        catch (\Throwable $error) { report($error); }
    }

    private function assertId(string $id): string
    {
        if (!Str::isUuid($id)) throw new RuntimeException('NOT_FOUND');
        return $id;
    }

    private function token(int $bytes): string
    {
        return rtrim(strtr(base64_encode(random_bytes($bytes)),'+/','-_'),'=');
    }

    private function nowMs(): int
    {
        return (int)floor(microtime(true)*1000);
    }
}
